import {
  createServerSupabaseClient,
  supabaseServerEnvironmentSchema,
  type SupabaseServerClient
} from '@chat-zernio/config';
import { createHash } from 'node:crypto';
import {
  InboundPayloadError,
  inboundConversationStatus,
  normalizeComment,
  normalizeConversationStarted,
  normalizeInboundMessage,
  normalizeSentMessage,
  type NormalizedInboundMessage
} from './zernio-inbound-normalizer';
import { storeConversationMedia } from './conversation-media-storage';
import {
  advanceMessageStatus,
  parseWhatsappButtonTapNotification,
  uuidDesdeHash,
  WHATSAPP_BUTTON_TAP_EVENT
} from '@chat-zernio/domain';
import { abandonedBefore, isReclaimDue } from './abandoned-claims';
import { OUTBOX_TAP_EVENT } from './outbox-claim';
import { isMediaRepairDue, repairPendingMedia } from './media-repair';
import { avatarSourceHash, storeContactAvatar } from './contact-avatar-storage';
import {
  MessageLifecyclePayloadError,
  normalizeMessageLifecycle
} from './zernio-message-lifecycle-normalizer';

type WebhookEvent = {
  event_type: string;
  id: string;
  payload: unknown;
  tenant_id: string;
};

class ProcessingFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function failureCode(error: unknown): string {
  if (error instanceof ProcessingFailure) return error.code;
  if (error instanceof InboundPayloadError) return 'invalid_message_received_payload';
  if (error instanceof MessageLifecyclePayloadError) return 'invalid_message_lifecycle_payload';
  return 'inbound_processing_failed';
}

type ChannelAccount = { display_name: string | null; id: string; platform: string | null };

export async function synchronizeChannelPlatform(
  supabase: SupabaseServerClient,
  tenantId: string,
  channelAccount: ChannelAccount,
  platform: string | null
): Promise<void> {
  if (!platform || channelAccount.platform === platform) return;

  const { error } = await supabase
    .from('channel_accounts')
    .update({ platform })
    .eq('id', channelAccount.id)
    .eq('tenant_id', tenantId);
  if (error) throw new ProcessingFailure('channel_platform_sync_failed');
}

/**
 * El nombre del canal lo elige el equipo. El proveedor solo puede rellenar un nombre que
 * este vacio: con varias cuentas de la misma plataforma, el nombre es lo unico que las
 * distingue, y sobrescribirlo borraria esa decision.
 */
export async function synchronizeChannelName(
  supabase: SupabaseServerClient,
  tenantId: string,
  channelAccount: ChannelAccount,
  providerName: string | null
): Promise<void> {
  if (!providerName || channelAccount.display_name) return;

  const { error } = await supabase
    .from('channel_accounts')
    .update({ display_name: providerName })
    .eq('id', channelAccount.id)
    .eq('tenant_id', tenantId)
    .is('display_name', null);
  if (error) throw new ProcessingFailure('channel_name_sync_failed');
}

/**
 * Registra y copia la multimedia del mensaje entrante.
 *
 * Nada de lo que ocurra aqui puede impedir que el mensaje quede guardado: un adjunto que no
 * se pueda registrar o descargar se anota y se sigue. El enlace del proveedor es firmado y
 * caduca en dias, asi que la copia se hace ahora o no se hace.
 */
export async function storeMessageAttachments(
  supabase: SupabaseServerClient,
  tenantId: string,
  conversationId: string,
  messageId: string,
  incoming: NormalizedInboundMessage
): Promise<void> {
  for (const attachment of incoming.attachments) {
    const { data: existing, error: lookupError } = await supabase
      .from('message_attachments')
      .select('id, storage_object_path')
      .eq('tenant_id', tenantId)
      .eq('message_id', messageId)
      .eq('ordinal', attachment.ordinal)
      .maybeSingle();

    if (lookupError) {
      console.error(JSON.stringify({ event: 'worker.media_lookup_failed', kind: attachment.kind }));
      continue;
    }
    if (existing?.storage_object_path) continue;

    let attachmentId = existing?.id ?? null;
    if (!attachmentId) {
      const { data: created, error: insertError } = await supabase
        .from('message_attachments')
        .insert({
          conversation_id: conversationId,
          kind: attachment.kind,
          source_kind: attachment.sourceKind,
          message_id: messageId,
          ordinal: attachment.ordinal,
          source_url: attachment.sourceUrl,
          source_title: attachment.title,
          tenant_id: tenantId
        })
        .select('id')
        .maybeSingle();

      if (insertError) {
        // 23505: otra ejecucion lo registro en paralelo. Cualquier otro error se anota y se sigue.
        if (insertError.code !== '23505') {
          console.error(
            JSON.stringify({ event: 'worker.media_record_failed', kind: attachment.kind })
          );
        }
        continue;
      }
      attachmentId = created?.id ?? null;
      if (!attachmentId) continue;
    }

    if (!attachment.sourceUrl) continue;

    const stored = await storeConversationMedia({
      conversationId,
      messageId,
      ordinal: attachment.ordinal,
      sourceUrl: attachment.sourceUrl,
      supabase,
      tenantId
    });

    const { error: updateError } = await supabase
      .from('message_attachments')
      .update(
        stored
          ? {
              byte_size: stored.byteSize,
              content_type: stored.contentType,
              downloaded_at: new Date().toISOString(),
              storage_object_path: stored.path
            }
          : { download_failed_at: new Date().toISOString() }
      )
      .eq('id', attachmentId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      console.error(JSON.stringify({ event: 'worker.media_update_failed', kind: attachment.kind }));
    }
    if (!stored) {
      console.error(
        JSON.stringify({ event: 'worker.media_download_failed', kind: attachment.kind })
      );
    }
  }
}

/** Lo minimo de una conversacion para colgarle mensajes. */
type ConversationRow = {
  id: string;
  last_message_at: string | null;
  status: string;
  status_version: number;
};

/**
 * Crea la conversacion del hilo, o adopta la que otro proceso creo a la vez.
 *
 * Dos mensajes seguidos del mismo contacto pueden entrar en paralelo y crear los dos la misma
 * conversacion. El segundo recibe un duplicado; si eso se tratara como un fallo, su mensaje se
 * quedaria sin guardar y el evento no se reprocesa nunca, asi que el mensaje del cliente se
 * perderia. En vez de eso se adopta la conversacion que gano, porque el hilo es el mismo.
 *
 * Devuelve null cuando el fallo no es un duplicado: ahi si hay que fallar.
 */
export async function createOrAdoptConversation(
  supabase: SupabaseServerClient,
  params: {
    channelAccountId: string;
    contactId: string;
    conversationReference: string;
    tenantId: string;
  }
): Promise<ConversationRow | null> {
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      channel_account_id: params.channelAccountId,
      contact_id: params.contactId,
      external_reference: params.conversationReference,
      tenant_id: params.tenantId
    })
    .select('id, last_message_at, status, status_version')
    .single();

  if (!error && data) return data;
  if (error?.code !== '23505') return null;

  const { data: raced } = await supabase
    .from('conversations')
    .select('id, last_message_at, status, status_version')
    .eq('tenant_id', params.tenantId)
    .eq('channel_account_id', params.channelAccountId)
    .eq('external_reference', params.conversationReference)
    .maybeSingle();

  return raced ?? null;
}

/**
 * La clave del aviso sale del mensaje entrante, no del intento.
 *
 * El mismo toque reenviado por el proveedor produce la misma clave, asi que choca con la que ya
 * existe en la cola y no se avisa dos veces.
 */
function tapNotificationIdempotencyKey(tenantId: string, messageReference: string): string {
  return uuidDesdeHash(
    createHash('sha256').update(`tap|${tenantId}|${messageReference}`).digest('hex')
  );
}

/**
 * Encola el aviso a n8n de un toque de boton de plantilla.
 *
 * Solo se avisa de un toque que responde a una plantilla NUESTRA. El mensaje citado se busca por su
 * referencia de proveedor, nunca por el texto que pulso el cliente: asi el mismo boton en otra
 * plantilla, o un texto escrito a mano que diga lo mismo, no se confunden con una respuesta.
 */
export async function enqueueButtonTapNotification(
  supabase: SupabaseServerClient,
  input: {
    channelAccountId: string;
    contactId: string;
    conversationId: string;
    incoming: NormalizedInboundMessage;
    messageId: string;
    n8nConfigured: boolean;
    tenantId: string;
  }
): Promise<void> {
  const tap = input.incoming.buttonTap;
  if (!tap) return;

  if (!input.n8nConfigured) {
    // Sin webhook no hay a donde avisar, y encolar un aviso condenado solo ensucia la cola. Queda
    // registrado para que el silencio no se confunda con «no paso nada».
    console.info(
      JSON.stringify({ event: 'worker.n8n_notification_skipped', reason: 'n8n_not_configured' })
    );
    return;
  }

  const { data: quoted, error: quotedError } = await supabase
    .from('messages')
    .select('whatsapp_template_language, whatsapp_template_name')
    .eq('tenant_id', input.tenantId)
    .eq('provider_message_id', tap.quotedMessageReference)
    .maybeSingle();
  if (quotedError) throw new ProcessingFailure('tap_quoted_message_lookup_failed');
  if (
    typeof quoted?.whatsapp_template_name !== 'string' ||
    typeof quoted.whatsapp_template_language !== 'string'
  ) {
    // El citado no es un mensaje nuestro enviado con plantilla: no hay nada que avisar.
    return;
  }

  const notification = parseWhatsappButtonTapNotification({
    buttonPayload: tap.payload,
    contactId: input.contactId,
    conversationId: input.conversationId,
    event: WHATSAPP_BUTTON_TAP_EVENT,
    messageId: input.messageId,
    occurredAt: new Date(input.incoming.receivedAt).toISOString(),
    template: {
      language: quoted.whatsapp_template_language,
      name: quoted.whatsapp_template_name
    }
  });

  const { error: enqueueError } = await supabase.from('outbox_events').insert({
    aggregate_id: input.conversationId,
    aggregate_type: 'conversation',
    event_type: OUTBOX_TAP_EVENT,
    idempotency_key: tapNotificationIdempotencyKey(input.tenantId, input.incoming.messageReference),
    payload: notification,
    tenant_id: input.tenantId
  });
  // El reenvio del mismo toque choca con la clave unica: es el resultado esperado, no un fallo.
  if (enqueueError && enqueueError.code !== '23505') {
    throw new ProcessingFailure('tap_notification_enqueue_failed');
  }
}

export class ZernioInboxWorker {
  private isRunning = false;
  private isReconcilingLifecycle = false;
  private lastReclaimAt = 0;
  private lastMediaRepairAt = 0;

  constructor(
    private readonly createClient: () => SupabaseServerClient,
    private readonly now: () => number = Date.now,
    /**
     * Si hay a donde avisar. Se decide al arrancar y no en cada toque: sin webhook configurado no
     * se encola nada, y el motivo queda registrado en lugar de acumular fallos en la cola.
     */
    private readonly n8nConfigured: boolean = false
  ) {}

  async drain(limit = 10): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const supabase = this.createClient();
      await this.reclaimAbandonedClaims(supabase);
      if (isMediaRepairDue(this.lastMediaRepairAt, this.now())) {
        this.lastMediaRepairAt = this.now();
        await repairPendingMedia(supabase, this.now());
      }
      const { data: events, error } = await supabase
        .from('webhook_events')
        .select('id, tenant_id, event_type, payload')
        .is('processed_at', null)
        .is('failed_at', null)
        .is('processing_started_at', null)
        .order('received_at', { ascending: true })
        .limit(limit);

      if (error) {
        console.error(
          JSON.stringify({
            event: 'worker.inbox_list_failed',
            failureCode: 'webhook_event_list_failed',
            databaseCode: error.code ?? 'unknown'
          })
        );
        return;
      }

      for (const event of (events ?? []) as WebhookEvent[]) {
        await this.claimAndProcess(supabase, event);
      }
    } finally {
      this.isRunning = false;
    }
  }

  async reconcileProcessedMessageLifecycles(limit = 100): Promise<void> {
    if (this.isReconcilingLifecycle) return;
    this.isReconcilingLifecycle = true;

    try {
      const supabase = this.createClient();
      const { data: events, error } = await supabase
        .from('webhook_events')
        .select('id, tenant_id, event_type, payload')
        .in('event_type', ['message.sent', 'message.delivered', 'message.read', 'message.failed'])
        .not('processed_at', 'is', null)
        .is('failed_at', null)
        .order('received_at', { ascending: true })
        .limit(limit);
      if (error) {
        console.error(
          JSON.stringify({
            event: 'worker.lifecycle_reconciliation_list_failed',
            failureCode: error.code ?? 'unknown'
          })
        );
        return;
      }

      for (const event of (events ?? []) as WebhookEvent[]) {
        try {
          await this.processMessageLifecycle(supabase, event);
        } catch (error) {
          console.error(
            JSON.stringify({
              event: 'worker.lifecycle_reconciliation_failed',
              failureCode: failureCode(error)
            })
          );
        }
      }
    } finally {
      this.isReconcilingLifecycle = false;
    }
  }

  /**
   * Devuelve a la cola los eventos cuyo reclamo quedo abandonado por una caida del proceso.
   * Solo se limpia la marca de reclamo: el reprocesamiento es seguro porque el contacto y la
   * conversacion se resuelven por referencia externa y el mensaje tolera el duplicado.
   */
  private async reclaimAbandonedClaims(supabase: SupabaseServerClient): Promise<void> {
    const now = this.now();
    if (!isReclaimDue(this.lastReclaimAt, now)) return;
    this.lastReclaimAt = now;

    try {
      const { data, error } = await supabase
        .from('webhook_events')
        .update({ processing_started_at: null })
        .is('processed_at', null)
        .is('failed_at', null)
        .lt('processing_started_at', abandonedBefore(now))
        .select('id');

      if (error) {
        console.error(
          JSON.stringify({
            event: 'worker.claim_reclaim_failed',
            databaseCode: error.code ?? 'unknown'
          })
        );
        return;
      }

      const reclaimed = Array.isArray(data) ? data.length : 0;
      if (reclaimed > 0) {
        console.info(JSON.stringify({ event: 'worker.claim_reclaimed', reclaimed }));
      }
    } catch {
      // Recuperar reclamos es una red de seguridad: su fallo nunca debe detener el drenaje.
      console.error(
        JSON.stringify({ event: 'worker.claim_reclaim_failed', databaseCode: 'unexpected' })
      );
    }
  }

  private async claimAndProcess(
    supabase: SupabaseServerClient,
    event: WebhookEvent
  ): Promise<void> {
    const startedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await supabase
      .from('webhook_events')
      .update({ processing_started_at: startedAt })
      .eq('id', event.id)
      .is('processed_at', null)
      .is('failed_at', null)
      .is('processing_started_at', null)
      .select('id')
      .maybeSingle();

    if (claimError || !claimed) return;

    try {
      if (event.event_type === 'comment.received') {
        await recordComment(supabase, event.payload, event.tenant_id);
      }
      if (event.event_type === 'review.new' || event.event_type === 'review.updated') {
        await recordGoogleBusinessReview(supabase, event.payload, event.tenant_id);
      }
      if (event.event_type === 'conversation.started') {
        await recordConversationStarted(supabase, event.payload, event.tenant_id);
      }
      if (event.event_type === 'message.received') {
        await this.processInboundMessage(supabase, event);
      }
      if (
        event.event_type === 'message.sent' ||
        event.event_type === 'message.delivered' ||
        event.event_type === 'message.read' ||
        event.event_type === 'message.failed'
      ) {
        await this.processMessageLifecycle(supabase, event);
      }

      const { error: completeError } = await supabase
        .from('webhook_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', event.id);

      if (completeError) throw new ProcessingFailure('webhook_event_complete_failed');
    } catch (error) {
      await supabase
        .from('webhook_events')
        .update({ failed_at: new Date().toISOString(), failure_code: failureCode(error) })
        .eq('id', event.id);
      console.error(
        JSON.stringify({ event: 'worker.inbound_failed', failureCode: failureCode(error) })
      );
    }
  }

  /**
   * Resuelve el contacto del mensaje entrante sin pisar lo que decidio el equipo.
   * El proveedor solo rellena un nombre que sigue siendo suyo y un telefono vacio: un
   * nombre corregido por el equipo queda marcado como tal y deja de sobrescribirse.
   */
  private async processInboundMessage(
    supabase: SupabaseServerClient,
    event: WebhookEvent
  ): Promise<void> {
    const incoming = normalizeInboundMessage(event.payload);
    const { data: channelAccount, error: channelError } = await supabase
      .from('channel_accounts')
      .select('id, platform, display_name')
      .eq('tenant_id', event.tenant_id)
      .eq('provider', 'zernio')
      .eq('provider_account_id', incoming.accountId)
      .maybeSingle();

    if (channelError || !channelAccount) {
      throw new ProcessingFailure('channel_account_not_associated');
    }

    await synchronizeChannelPlatform(supabase, event.tenant_id, channelAccount, incoming.platform);
    await synchronizeChannelName(supabase, event.tenant_id, channelAccount, incoming.accountName);

    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .upsert(
        {
          display_name: incoming.contactDisplayName,
          external_reference: incoming.contactReference,
          tenant_id: event.tenant_id,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'tenant_id,external_reference' }
      )
      .select('id, avatar_object_path, avatar_source_hash')
      .single();

    if (contactError || !contact) throw new ProcessingFailure('contact_upsert_failed');

    if (incoming.contactUsername) {
      const { error: usernameError } = await supabase
        .from('contacts')
        .update({
          external_username: incoming.contactUsername,
          updated_at: new Date().toISOString()
        })
        .eq('id', contact.id)
        .eq('tenant_id', event.tenant_id);
      if (usernameError) throw new ProcessingFailure('contact_username_update_failed');
    }

    if (incoming.avatarSourceUrl) {
      const sourceHash = avatarSourceHash(incoming.avatarSourceUrl);
      if (contact.avatar_source_hash !== sourceHash) {
        const avatarPath = await storeContactAvatar({
          contactId: contact.id,
          sourceHash,
          sourceUrl: incoming.avatarSourceUrl,
          supabase,
          tenantId: event.tenant_id
        });
        if (avatarPath) {
          const { error: avatarError } = await supabase
            .from('contacts')
            .update({
              avatar_object_path: avatarPath,
              avatar_source_hash: sourceHash,
              updated_at: new Date().toISOString()
            })
            .eq('id', contact.id)
            .eq('tenant_id', event.tenant_id);
          if (avatarError) {
            console.error(
              JSON.stringify({
                event: 'worker.contact_avatar_update_failed',
                failureCode: 'contact_avatar_update_failed'
              })
            );
          }
        }
      }
    }

    const { data: existingConversation, error: conversationLookupError } = await supabase
      .from('conversations')
      .select('id, last_message_at, status, status_version')
      .eq('tenant_id', event.tenant_id)
      .eq('channel_account_id', channelAccount.id)
      .eq('external_reference', incoming.conversationReference)
      .maybeSingle();

    if (conversationLookupError) throw new ProcessingFailure('conversation_lookup_failed');

    let conversation = existingConversation;
    if (!conversation) {
      // Un comentario pudo abrir ya la conversacion de esta persona. El mensaje directo la
      // adopta en lugar de crear un hilo nuevo: es la misma persona y su historial no debe
      // quedar partido en dos. Solo se adoptan conversaciones sin el identificador del
      // proveedor, porque si lo tuvieran las habria encontrado la busqueda anterior.
      const { data: openedByComment, error: adoptionError } = await supabase
        .from('conversations')
        .select('id, last_message_at, status, status_version')
        .eq('tenant_id', event.tenant_id)
        .eq('channel_account_id', channelAccount.id)
        .eq('contact_id', contact.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (adoptionError) throw new ProcessingFailure('conversation_adoption_failed');

      if (openedByComment) {
        const { error: adoptError } = await supabase
          .from('conversations')
          .update({ external_reference: incoming.conversationReference })
          .eq('id', openedByComment.id)
          .eq('tenant_id', event.tenant_id);
        if (adoptError) throw new ProcessingFailure('conversation_adoption_failed');
        conversation = openedByComment;
      }
    }
    if (!conversation) {
      // Dos mensajes seguidos del mismo hilo pueden procesarse a la vez y crear los dos la
      // conversacion. El que pierde adopta la del que gano: si fallara, el mensaje del cliente se
      // quedaria sin guardar y el evento no se reprocesa, asi que se perderia para siempre.
      const created = await createOrAdoptConversation(supabase, {
        channelAccountId: String(channelAccount.id),
        contactId: String(contact.id),
        conversationReference: incoming.conversationReference,
        tenantId: String(event.tenant_id)
      });
      if (!created) throw new ProcessingFailure('conversation_create_failed');
      conversation = created;
    }

    const { data: insertedMessage, error: messageError } = await supabase
      .from('messages')
      .insert({
        body: incoming.body,
        channel_account_id: channelAccount.id,
        conversation_id: conversation.id,
        direction: 'inbound',
        provider_message_id: incoming.messageReference,
        sender_type: 'contact',
        status: 'received',
        tenant_id: event.tenant_id
      })
      .select('id')
      .maybeSingle();

    if (messageError?.code === '23505') {
      // Reintento del proveedor: el mensaje ya existe. Se recupera su identificador para
      // que su multimedia no se pierda si la primera ejecucion no alcanzo a copiarla.
      const { data: existingMessage } = await supabase
        .from('messages')
        .select('id')
        .eq('tenant_id', event.tenant_id)
        .eq('channel_account_id', channelAccount.id)
        .eq('provider_message_id', incoming.messageReference)
        .maybeSingle();
      if (existingMessage) {
        await storeMessageAttachments(
          supabase,
          event.tenant_id,
          conversation.id,
          existingMessage.id,
          incoming
        );
        // El reintento del proveedor entra por aqui. Si el intento anterior alcanzo a guardar el
        // mensaje y cayo antes de avisar, este es el unico sitio donde el aviso se puede recuperar:
        // por eso se encola tambien en esta rama, y la clave determinista evita el aviso doble.
        await this.enqueueButtonTapNotification(supabase, {
          channelAccountId: String(channelAccount.id),
          contactId: String(contact.id),
          conversationId: String(conversation.id),
          incoming,
          messageId: String(existingMessage.id),
          tenantId: String(event.tenant_id)
        });
      }
      return;
    }
    if (messageError || !insertedMessage) throw new ProcessingFailure('message_create_failed');

    await storeMessageAttachments(
      supabase,
      event.tenant_id,
      conversation.id,
      insertedMessage.id,
      incoming
    );

    await this.enqueueButtonTapNotification(supabase, {
      channelAccountId: String(channelAccount.id),
      contactId: String(contact.id),
      conversationId: String(conversation.id),
      incoming,
      messageId: String(insertedMessage.id),
      tenantId: String(event.tenant_id)
    });

    const lastMessageAt = conversation.last_message_at;
    const shouldAdvanceTimestamp = !lastMessageAt || incoming.receivedAt > lastMessageAt;
    const nextStatus = inboundConversationStatus(conversation.status);

    if (shouldAdvanceTimestamp || nextStatus !== conversation.status) {
      const { error: updateError } = await supabase
        .from('conversations')
        .update({
          // El origen no depende del orden: un mensaje directo convierte la conversacion en
          // conversacion de mensajes aunque llegue con retraso.
          has_dm: true,
          last_message_at: shouldAdvanceTimestamp ? incoming.receivedAt : lastMessageAt,
          status: nextStatus,
          status_version:
            nextStatus === conversation.status
              ? conversation.status_version
              : conversation.status_version + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversation.id)
        .eq('tenant_id', event.tenant_id);

      if (updateError) throw new ProcessingFailure('conversation_update_failed');
    }
  }

  /**
   * Encola el aviso a n8n de un toque de boton de plantilla.
   *
   * Se encola en lugar de llamar a n8n aqui: una caida del agente no puede impedir que el mensaje
   * del cliente quede guardado, y el aviso merece sus propios reintentos y su propio rastro.
   */
  private async enqueueButtonTapNotification(
    supabase: SupabaseServerClient,
    context: {
      channelAccountId: string;
      contactId: string;
      conversationId: string;
      incoming: NormalizedInboundMessage;
      messageId: string;
      tenantId: string;
    }
  ): Promise<void> {
    await enqueueButtonTapNotification(supabase, {
      ...context,
      n8nConfigured: this.n8nConfigured
    });
  }

  /**
   * Guarda una respuesta de la automatizacion del proveedor.
   *
   * Nunca inventa una conversacion: si no existe, el mensaje entrante que la origina la creara
   * y se deja constancia. Asi el contacto, la conversacion y sus reglas siguen teniendo un solo
   * responsable.
   */
  private async processMessageLifecycle(
    supabase: SupabaseServerClient,
    event: WebhookEvent
  ): Promise<void> {
    const lifecycle = normalizeMessageLifecycle(event.payload);
    const { data: channelAccount, error: channelError } = await supabase
      .from('channel_accounts')
      .select('id')
      .eq('tenant_id', event.tenant_id)
      .eq('provider', 'zernio')
      .eq('provider_account_id', lifecycle.accountId)
      .maybeSingle();
    if (channelError || !channelAccount) {
      throw new ProcessingFailure('lifecycle_channel_account_not_associated');
    }

    const { data: message, error: messageError } = await supabase
      .from('messages')
      .select('id, direction, status')
      .eq('tenant_id', event.tenant_id)
      .eq('channel_account_id', channelAccount.id)
      .eq('provider_message_id', lifecycle.messageReference)
      .maybeSingle();
    if (messageError) throw new ProcessingFailure('lifecycle_message_lookup_failed');
    if (!message) {
      // Un message.sent que no reconocemos es una respuesta de la automatizacion: no la
      // enviamos desde aqui, asi que se guarda para que el equipo la vea en el hilo.
      if (event.event_type === 'message.sent') {
        await recordAutomationMessage(supabase, event.payload, event.tenant_id, channelAccount.id);
      }
      return;
    }
    if (message.direction !== 'outbound') {
      throw new ProcessingFailure('lifecycle_message_not_outbound');
    }

    const nextStatus = advanceMessageStatus(message.status, lifecycle.status);
    if (nextStatus === message.status) return;
    const { error: updateError } = await supabase
      .from('messages')
      .update({ status: nextStatus })
      .eq('id', message.id)
      .eq('tenant_id', event.tenant_id);
    if (updateError) throw new ProcessingFailure('lifecycle_message_update_failed');
  }
}

export function createZernioInboxWorker(
  environment: Record<string, string | undefined> = process.env
): ZernioInboxWorker {
  const configuration = supabaseServerEnvironmentSchema.parse(environment);
  return new ZernioInboxWorker(
    () => createServerSupabaseClient(configuration),
    Date.now,
    // El aviso a n8n solo tiene sentido si hay direccion y secreto; se decide una vez, al arrancar.
    Boolean(environment.N8N_AGENT_WEBHOOK_URL?.trim() && environment.N8N_AGENT_AUTH_SECRET?.trim())
  );
}

/**
 * Guarda una respuesta de la automatizacion del proveedor.
 *
 * Nunca inventa una conversacion: si no existe, el mensaje entrante que la origina la creara
 * y se deja constancia. Asi el contacto, la conversacion y sus reglas siguen teniendo un solo
 * responsable.
 */
export async function recordAutomationMessage(
  supabase: SupabaseServerClient,
  payload: unknown,
  tenantId: string,
  channelAccountId: string
): Promise<void> {
  const sent = normalizeSentMessage(payload);
  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select('id, last_message_at, status, status_version')
    .eq('tenant_id', tenantId)
    .eq('channel_account_id', channelAccountId)
    .eq('external_reference', sent.conversationReference)
    .maybeSingle();
  if (conversationError) {
    throw new ProcessingFailure('automation_conversation_lookup_failed');
  }
  let targetConversation = conversation;
  if (!targetConversation) {
    // El bot puede abrir la conversacion (por ejemplo, respondiendo un comentario) y entonces
    // no existe fila todavia. Se crea con los datos del propio evento, reutilizando la
    // resolucion de contacto de la bandeja para no tener dos reglas distintas.
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .upsert(
        {
          display_name: sent.contactDisplayName,
          external_reference: sent.contactReference,
          tenant_id: tenantId,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'tenant_id,external_reference' }
      )
      .select('id')
      .single();
    if (contactError || !contact) {
      throw new ProcessingFailure('automation_contact_create_failed');
    }
    const created = await createOrAdoptConversation(supabase, {
      channelAccountId: String(channelAccountId),
      contactId: String(contact.id),
      conversationReference: sent.conversationReference,
      tenantId: String(tenantId)
    });
    if (!created) throw new ProcessingFailure('automation_conversation_create_failed');
    targetConversation = created;
    console.log(JSON.stringify({ event: 'worker.automation_conversation_created' }));
  }

  const { error: messageError } = await supabase.from('messages').insert({
    body: sent.body,
    channel_account_id: channelAccountId,
    conversation_id: targetConversation.id,
    direction: 'outbound',
    provider_message_id: sent.messageReference,
    sender_type: 'automation',
    sent_at: sent.receivedAt,
    status: 'sent',
    tenant_id: tenantId
  });
  if (messageError?.code === '23505') return;
  if (messageError) throw new ProcessingFailure('automation_message_create_failed');

  const lastMessageAt = targetConversation.last_message_at;
  const shouldAdvance = !lastMessageAt || sent.receivedAt > lastMessageAt;
  if (shouldAdvance) {
    const { error: updateError } = await supabase
      .from('conversations')
      .update({ has_dm: true, last_message_at: sent.receivedAt })
      .eq('id', targetConversation.id)
      .eq('tenant_id', tenantId);
    if (updateError) throw new ProcessingFailure('automation_conversation_update_failed');
  }
}

/**
 * Guarda el inicio de la conversacion que informa el proveedor.
 *
 * Se conserva el valor mas antiguo conocido: el dato del proveedor es exacto, pero si llega
 * repetido o mas tarde no puede retroceder el inicio ya registrado.
 */
export async function recordConversationStarted(
  supabase: SupabaseServerClient,
  payload: unknown,
  tenantId: string
): Promise<void> {
  const started = normalizeConversationStarted(payload);
  const { data: channelAccount, error: channelError } = await supabase
    .from('channel_accounts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('provider', 'zernio')
    .eq('provider_account_id', started.accountId)
    .maybeSingle();
  if (channelError || !channelAccount) return;

  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select('id, started_at')
    .eq('tenant_id', tenantId)
    .eq('channel_account_id', channelAccount.id)
    .eq('external_reference', started.conversationReference)
    .maybeSingle();
  if (conversationError || !conversation) return;
  if (typeof conversation.started_at === 'string' && conversation.started_at <= started.startedAt) {
    return;
  }

  const { error: updateError } = await supabase
    .from('conversations')
    .update({ started_at: started.startedAt })
    .eq('id', conversation.id)
    .eq('tenant_id', tenantId);
  if (updateError) throw new ProcessingFailure('conversation_started_update_failed');
}

/**
 * Guarda un comentario de publicacion dentro de la conversacion de esa persona.
 *
 * Un comentario no trae conversacion propia, asi que se busca la de su contacto. No se inventa
 * una: inventarla crearia dos conversaciones para la misma persona en cuanto llegara su mensaje
 * directo, que es el que trae el identificador real.
 */
/** Guarda la reseña sin interpretar su texto ni publicar una respuesta. */
export async function recordGoogleBusinessReview(
  supabase: SupabaseServerClient,
  payload: unknown,
  tenantId: string
): Promise<void> {
  const row = payload as { account?: { id?: unknown }; review?: Record<string, unknown> };
  const review = row.review;
  const accountId = typeof row.account?.id === 'string' ? row.account.id : '';
  const reviewId = typeof review?.id === 'string' ? review.id : '';
  const rating = Number(review?.rating);
  const createdAt = typeof review?.createdAt === 'string' ? review.createdAt : null;
  if (
    !accountId ||
    !reviewId ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5 ||
    !createdAt
  ) {
    throw new ProcessingFailure('invalid_google_review_payload');
  }
  const reviewer = review?.reviewer as { name?: unknown } | undefined;
  const { data: persisted, error } = await supabase
    .from('google_business_reviews')
    .upsert(
      {
        body: typeof review?.text === 'string' ? review.text : null,
        rating,
        replied_at: review?.hasReply === true ? new Date().toISOString() : null,
        review_updated_at: createdAt,
        reviewer_name: typeof reviewer?.name === 'string' ? reviewer.name : null,
        tenant_id: tenantId,
        updated_at: new Date().toISOString(),
        zernio_account_id: accountId,
        provider_review_id: reviewId
      },
      { onConflict: 'tenant_id,provider_review_id' }
    )
    .select('id')
    .single();
  if (error || !persisted) throw new ProcessingFailure('google_review_persist_failed');
  const { error: deliveryError } = await supabase
    .from('google_review_deliveries')
    .upsert(
      { review_id: persisted.id, tenant_id: tenantId, updated_at: new Date().toISOString() },
      { onConflict: 'review_id' }
    );
  if (deliveryError) throw new ProcessingFailure('google_review_delivery_enqueue_failed');
}

export async function recordComment(
  supabase: SupabaseServerClient,
  payload: unknown,
  tenantId: string
): Promise<void> {
  const comment = normalizeComment(payload);
  const { data: channelAccount, error: channelError } = await supabase
    .from('channel_accounts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('provider', 'zernio')
    .eq('provider_account_id', comment.accountId)
    .maybeSingle();
  if (channelError || !channelAccount) return;

  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('external_reference', comment.contactReference)
    .maybeSingle();
  let targetContact = contact;
  if (contactError) throw new ProcessingFailure('comment_contact_lookup_failed');
  if (!targetContact) {
    // Quien comenta puede no haber escrito nunca: el comentario abre la conversacion.
    const { data: createdContact, error: contactCreateError } = await supabase
      .from('contacts')
      .upsert(
        {
          display_name: comment.contactDisplayName,
          external_reference: comment.contactReference,
          tenant_id: tenantId,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'tenant_id,external_reference' }
      )
      .select('id')
      .single();
    if (contactCreateError || !createdContact) {
      throw new ProcessingFailure('comment_contact_create_failed');
    }
    targetContact = createdContact;
  }

  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select('id, last_message_at')
    .eq('tenant_id', tenantId)
    .eq('contact_id', targetContact.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  let targetConversation = conversation;
  if (conversationError) throw new ProcessingFailure('comment_conversation_lookup_failed');
  if (!targetConversation) {
    const { data: createdConversation, error: conversationCreateError } = await supabase
      .from('conversations')
      .insert({
        channel_account_id: channelAccount.id,
        contact_id: targetContact.id,
        external_reference: comment.conversationReference,
        started_at: comment.receivedAt,
        tenant_id: tenantId
      })
      .select('id, last_message_at')
      .single();
    if (conversationCreateError || !createdConversation) {
      throw new ProcessingFailure('comment_conversation_create_failed');
    }
    targetConversation = createdConversation;
  }

  const { error: messageError } = await supabase.from('messages').insert({
    body: comment.body,
    channel_account_id: channelAccount.id,
    conversation_id: targetConversation.id,
    direction: 'inbound',
    platform_post_id: comment.platformPostId,
    provider_message_id: comment.commentReference,
    sender_type: 'contact',
    sent_at: comment.receivedAt,
    source: 'comment',
    status: 'received',
    tenant_id: tenantId
  });
  if (messageError?.code === '23505') return;
  if (messageError) throw new ProcessingFailure('comment_message_create_failed');

  const { error: flagError } = await supabase
    .from('conversations')
    .update({ has_comment: true })
    .eq('id', targetConversation.id)
    .eq('tenant_id', tenantId);
  if (flagError) throw new ProcessingFailure('comment_conversation_flag_failed');

  const lastMessageAt = targetConversation.last_message_at;
  if (!lastMessageAt || comment.receivedAt > lastMessageAt) {
    const { error: updateError } = await supabase
      .from('conversations')
      .update({ last_message_at: comment.receivedAt })
      .eq('id', targetConversation.id)
      .eq('tenant_id', tenantId);
    if (updateError) throw new ProcessingFailure('comment_conversation_update_failed');
  }
}
