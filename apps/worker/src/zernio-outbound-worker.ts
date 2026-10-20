import {
  createServerSupabaseClient,
  supabaseServerEnvironmentSchema,
  type SupabaseServerClient
} from '@chat-zernio/config';
import { signMediaPaths } from '@chat-zernio/media';
import { getAgentInvocationEligibility, whatsappTemplateReferenceFrom } from '@chat-zernio/domain';
import { isReclaimDue } from './abandoned-claims';
import {
  claimEvent,
  completeEvent,
  failEvent,
  listPendingEvents,
  OUTBOX_MESSAGE_EVENT,
  reclaimAbandonedEvents,
  type OutboxEvent
} from './outbox-claim';
import { z } from 'zod';

type DispatchInput = {
  accountId: string;
  /** Adjunto ya firmado. Meta admite una multimedia por mensaje, asi que va uno solo. */
  attachment?: { kind: string; url: string };
  body: string;
  conversationId: string;
  idempotencyKey: string;
  /**
   * Plantilla aprobada de Meta, cuando el mensaje salio asi.
   *
   * Es la CARGA que se despacha: el proveedor resuelve el par nombre+idioma exactos antes de enviar
   * y no acepta texto libre en su lugar. `body` es solo la copia visible del historial.
   */
  whatsappTemplate?: { language: string; name: string };
};

type DispatchResult = {
  providerMessageId: string;
  sentAt: string | null;
};

/**
 * Caducidad de las direcciones firmadas de los adjuntos.
 *
 * Diez minutos, como fija docs/TOOLS_CONTRACT.md: la direccion se firma en el momento de enviar y
 * solo tiene que servir para ese envio. El bucket NO se escribe aqui: cada fila declara donde vive su
 * archivo, porque hay dos procedencias -- el catalogo de una sede y la carga de la conversacion -- y
 * firmarlas todas contra uno dejaba sin enlace lo que vivia en el otro.
 */
const ATTACHMENT_URL_TTL_SECONDS = 600;

const sendResponseSchema = z.object({
  data: z.object({
    messageId: z.string().trim().min(1).max(300),
    sentAt: z.string().datetime({ offset: true }).optional()
  })
});

export class ZernioDispatchError extends Error {
  constructor(
    readonly retryable: boolean,
    readonly code: string
  ) {
    super(code);
  }
}

export type ZernioDispatcher = { send(input: DispatchInput): Promise<DispatchResult> };

/**
 * Que fallos del proveedor merecen otro intento.
 *
 * `400` y `422` son definitivos: no hay variante aprobada de esa plantilla en ese idioma, o la
 * peticion no es valida; repetir no puede funcionar. `408`, `409`, `429` y los `5xx` si.
 *
 * El `502` se reintenta a proposito: el proveedor lo usa tanto para «esta cuenta no tiene cuenta de
 * WhatsApp Business» —definitivo— como para un fallo pasajero de su plataforma. Como en una
 * respuesta no-2xx no se envio nada, el reintento acotado no puede duplicar el mensaje.
 */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

export function createZernioDispatcher(
  apiKey: string,
  request: typeof fetch = fetch
): ZernioDispatcher {
  return {
    async send(input: DispatchInput): Promise<DispatchResult> {
      const response = await request(
        `https://zernio.com/api/v1/inbox/conversations/${encodeURIComponent(input.conversationId)}/messages`,
        {
          body: JSON.stringify({
            accountId: input.accountId,
            ...(input.whatsappTemplate
              ? {
                  template: {
                    elements: [
                      {
                        language: input.whatsappTemplate.language,
                        name: input.whatsappTemplate.name
                      }
                    ]
                  }
                }
              : {
                  message: input.body,
                  // Solo se anaden cuando hay adjunto: sin el, el cuerpo es el de siempre y el
                  // comportamiento no cambia.
                  ...(input.attachment
                    ? {
                        attachmentType: input.attachment.kind,
                        attachmentUrl: input.attachment.url
                      }
                    : {})
                })
          }),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': input.idempotencyKey
          },
          method: 'POST',
          signal: AbortSignal.timeout(10_000)
        }
      );

      if (!response.ok) {
        throw new ZernioDispatchError(
          isRetryableStatus(response.status),
          `zernio_http_${response.status}`
        );
      }

      const payload = await response.json().catch(() => null);
      const parsed = sendResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new ZernioDispatchError(true, 'zernio_send_response_invalid');
      }

      return {
        providerMessageId: parsed.data.data.messageId,
        sentAt: parsed.data.data.sentAt ?? null
      };
    }
  };
}

function readMessageId(payload: unknown): string | null {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('messageId' in payload) ||
    typeof payload.messageId !== 'string'
  ) {
    return null;
  }
  return payload.messageId;
}

function conversationIdFromReference(reference: unknown, providerAccountId: string): string | null {
  if (typeof reference !== 'string') return null;
  const prefix = `zernio:${providerAccountId}:conversation:`;
  if (!reference.startsWith(prefix)) return null;
  const value = reference.slice(prefix.length);
  return value ? value : null;
}

function messageReference(providerAccountId: string, providerMessageId: string): string {
  return `zernio:${providerAccountId}:message:${providerMessageId}`;
}

export class ZernioOutboundWorker {
  private isRunning = false;
  private lastReclaimAt = 0;

  constructor(
    private readonly createClient: () => SupabaseServerClient,
    private readonly dispatcher: ZernioDispatcher,
    private readonly now: () => number = Date.now
  ) {}

  async drain(limit = 10): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const supabase = this.createClient();
      await this.reclaimAbandonedDispatches(supabase);
      // Solo los mensajes: los avisos a n8n tienen su propio despachador, con su event_type.
      const { errorCode, events } = await listPendingEvents(supabase, OUTBOX_MESSAGE_EVENT, limit);
      if (errorCode) {
        console.error(
          JSON.stringify({ event: 'worker.outbox_list_failed', failureCode: errorCode })
        );
        return;
      }
      for (const event of events) await this.claimAndProcess(supabase, event);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Devuelve a la cola un despacho cuyo reclamo quedo abandonado por una caida del proceso.
   * El reenvio esta protegido por la clave de idempotencia estable del evento, de modo que
   * repetirlo no duplica el mensaje. El presupuesto de intentos sigue acotando el ciclo.
   */
  private async reclaimAbandonedDispatches(supabase: SupabaseServerClient): Promise<void> {
    const now = this.now();
    if (!isReclaimDue(this.lastReclaimAt, now)) return;
    this.lastReclaimAt = now;

    // Recuperar reclamos es una red de seguridad: su fallo nunca debe detener el drenaje.
    const { errorCode, reclaimed } = await reclaimAbandonedEvents(supabase, now);
    if (errorCode) {
      console.error(
        JSON.stringify({
          event: 'worker.outbox_dispatch_reclaim_failed',
          databaseCode: errorCode
        })
      );
      return;
    }
    if (reclaimed > 0) {
      console.info(JSON.stringify({ event: 'worker.outbox_dispatch_reclaimed', reclaimed }));
    }
  }

  private async claimAndProcess(supabase: SupabaseServerClient, event: OutboxEvent): Promise<void> {
    const { attempt, claimed } = await claimEvent(supabase, event);
    if (!claimed) return;

    const messageId = readMessageId(event.payload);
    if (!messageId)
      return this.fail(
        supabase,
        event,
        attempt,
        null,
        new ZernioDispatchError(false, 'invalid_outbox_payload')
      );

    try {
      const { data: message, error: messageError } = await supabase
        .from('messages')
        .select(
          'id, body, sender_type, conversation_id, channel_account_id, idempotency_key, status, whatsapp_template_name, whatsapp_template_language'
        )
        .eq('id', messageId)
        .eq('tenant_id', event.tenant_id)
        .maybeSingle();
      if (messageError || !message || !message.channel_account_id || !message.idempotency_key) {
        throw new ZernioDispatchError(false, 'outbox_message_unavailable');
      }
      // Si el envio ya quedo confirmado, recuperar el evento solo debe cerrar la cola.
      // Una pausa posterior no convierte un mensaje enviado en fallido ni provoca otro envio.
      if (['sent', 'delivered', 'read'].includes(message.status)) {
        if (!(await completeEvent(supabase, event.id))) {
          throw new ZernioDispatchError(true, 'outbox_completion_failed');
        }
        return;
      }
      const { data: conversation, error: conversationError } = await supabase
        .from('conversations')
        .select('channel_account_id, external_reference')
        .eq('id', message.conversation_id)
        .eq('tenant_id', event.tenant_id)
        .maybeSingle();
      const { data: channel, error: channelError } = await supabase
        .from('channel_accounts')
        .select('provider, provider_account_id')
        .eq('id', message.channel_account_id)
        .eq('tenant_id', event.tenant_id)
        .maybeSingle();
      if (
        conversationError ||
        channelError ||
        !conversation ||
        !channel ||
        conversation.channel_account_id !== message.channel_account_id ||
        channel.provider !== 'zernio'
      ) {
        throw new ZernioDispatchError(false, 'outbox_channel_mismatch');
      }
      const providerConversationId = conversationIdFromReference(
        conversation.external_reference,
        channel.provider_account_id
      );
      if (!providerConversationId)
        throw new ZernioDispatchError(false, 'outbox_conversation_reference_invalid');

      await supabase
        .from('messages')
        .update({ status: 'sending' })
        .eq('id', message.id)
        .eq('tenant_id', event.tenant_id)
        .eq('status', 'queued');
      const whatsappTemplate = whatsappTemplateReferenceFrom(
        message.whatsapp_template_name,
        message.whatsapp_template_language
      );
      const attachment = whatsappTemplate
        ? undefined
        : await this.readSignedAttachment(supabase, event.tenant_id, message.id);
      // La firma puede tardar: leer el modo DESPUES, sin reutilizar el estado del encolado.
      if (message.sender_type === 'automation') {
        const { data: automation, error: automationError } = await supabase
          .from('conversations')
          .select('automation_mode')
          .eq('id', message.conversation_id)
          .eq('tenant_id', event.tenant_id)
          .maybeSingle();
        if (automationError || !automation) {
          throw new ZernioDispatchError(true, 'automation_state_unavailable');
        }
        if (!getAgentInvocationEligibility(automation.automation_mode).allowed) {
          throw new ZernioDispatchError(false, 'automation_not_auto');
        }
      } else if (message.sender_type !== 'agent') {
        throw new ZernioDispatchError(false, 'outbox_sender_invalid');
      }
      const dispatch = await this.dispatcher.send({
        accountId: channel.provider_account_id,
        // Una plantilla trae su propio contenido: el adjunto solo acompana a un mensaje de texto.
        attachment,
        body: message.body,
        conversationId: providerConversationId,
        idempotencyKey: message.idempotency_key,
        ...(whatsappTemplate ? { whatsappTemplate } : {})
      });
      // Zernio may acknowledge a send with a messageId but without its optional sentAt.
      // In that case this is the local acknowledgement time, not a delivery/read receipt.
      const acknowledgedAt = new Date().toISOString();
      const { error: messageUpdateError } = await supabase
        .from('messages')
        .update({
          provider_message_id: messageReference(
            channel.provider_account_id,
            dispatch.providerMessageId
          ),
          sent_at: dispatch.sentAt ?? acknowledgedAt,
          status: 'sent'
        })
        .eq('id', message.id)
        .eq('tenant_id', event.tenant_id);
      if (messageUpdateError)
        throw new ZernioDispatchError(true, 'outbox_message_sent_update_failed');
      const completed = await completeEvent(supabase, event.id);
      if (!completed) throw new ZernioDispatchError(true, 'outbox_completion_failed');
    } catch (error) {
      await this.fail(supabase, event, attempt, messageId, error);
    }
  }

  /**
   * El adjunto del mensaje, ya firmado, o nada si no lleva.
   *
   * Se firma AQUI, en el momento de enviar, y no al encolar: la direccion firmada caduca, y un
   * reintento tardio mandaria un enlace muerto. El cliente no veria la imagen y nada lo delataria.
   *
   * El bucket lo declara la fila: hay dos procedencias -- el catalogo de una sede y la carga de la
   * conversacion -- y adivinar donde vive el archivo es justo lo que dejaba sin copia lo que el bot
   * manda. Meta admite una multimedia por mensaje, asi que se toma la primera por su orden.
   *
   * Una fila con archivo del que NO se puede obtener la direccion no se ignora: eso mandaria el
   * mensaje sin su foto y lo marcaria como enviado. Falla de forma visible y reintentable.
   */
  private async readSignedAttachment(
    supabase: SupabaseServerClient,
    tenantId: string,
    messageId: string
  ): Promise<{ kind: string; url: string } | undefined> {
    const { data: filas } = await supabase
      .from('message_attachments')
      .select('bucket, kind, storage_object_path')
      .eq('tenant_id', tenantId)
      .eq('message_id', messageId)
      .order('ordinal', { ascending: true })
      .limit(1);

    const fila = (Array.isArray(filas) ? filas[0] : null) as
      | { bucket?: unknown; kind?: unknown; storage_object_path?: unknown }
      | null
      | undefined;
    const ruta = typeof fila?.storage_object_path === 'string' ? fila.storage_object_path : null;
    // Sin copia propia no hay nada que adjuntar: el mensaje es de solo texto y sale como siempre.
    if (!ruta) return undefined;

    const bucket = typeof fila?.bucket === 'string' ? fila.bucket : null;
    if (!bucket) throw new ZernioDispatchError(true, 'outbox_attachment_bucket_missing');

    let firmadas: Map<string, string>;
    try {
      firmadas = await signMediaPaths({
        bucket,
        paths: [ruta],
        signer: supabase,
        ttlSeconds: ATTACHMENT_URL_TTL_SECONDS
      });
    } catch {
      // El almacen no respondio: no se puede afirmar que el archivo no este, asi que se reintenta.
      throw new ZernioDispatchError(true, 'outbox_attachment_sign_failed');
    }
    const url = firmadas.get(ruta) ?? null;
    if (!url) throw new ZernioDispatchError(true, 'outbox_attachment_unavailable');

    return { kind: typeof fila?.kind === 'string' ? fila.kind : 'image', url };
  }

  private async fail(
    supabase: SupabaseServerClient,
    event: OutboxEvent,
    attempt: number,
    messageId: string | null,
    error: unknown
  ): Promise<void> {
    const providerError =
      error instanceof ZernioDispatchError
        ? error
        : new ZernioDispatchError(true, 'zernio_dispatch_failed');
    const { retried } = await failEvent(
      supabase,
      event,
      { attempt, code: providerError.code, retryable: providerError.retryable },
      this.now
    );
    if (messageId) {
      await supabase
        .from('messages')
        .update({ status: retried ? 'queued' : 'failed' })
        .eq('id', messageId)
        .eq('tenant_id', event.tenant_id)
        .in('status', ['queued', 'sending']);
    }
    console.error(
      JSON.stringify({ event: 'worker.outbox_dispatch_failed', failureCode: providerError.code })
    );
  }
}

export function createZernioOutboundWorker(
  environment: Record<string, string | undefined> = process.env
): ZernioOutboundWorker {
  const configuration = supabaseServerEnvironmentSchema.parse(environment);
  const apiKey = environment.ZERNIO_API_KEY;
  if (!apiKey) throw new Error('ZERNIO_API_KEY es obligatoria para el worker de salida.');
  return new ZernioOutboundWorker(
    () => createServerSupabaseClient(configuration),
    createZernioDispatcher(apiKey)
  );
}

export { conversationIdFromReference, messageReference };
