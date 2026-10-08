import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import {
  conversationMessageListResponseSchema,
  conversationMessageSchema,
  createOutboundMessageResponseSchema,
  type ConversationMessage,
  type MessageAttachment,
  type ConversationMessageListQuery,
  type ConversationMessageListResponse,
  type CreateOutboundMessage,
  type CreateOutboundMessageResponse
} from '@chat-zernio/contracts';
import {
  findWhatsappTemplateByReference,
  whatsappTemplateReferenceFrom,
  whatsappTemplateSendability
} from '@chat-zernio/domain';
import { RequestAuthenticator } from '../auth/request-authenticator';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantAccessService } from '../tenants/tenant-access.service';
import { WhatsappTemplateCatalog } from '../zernio/whatsapp-template-catalog';
import { signMediaUrls } from './conversation-media.service';

type PersistedMessage = {
  attachments?: unknown;
  body: unknown;
  comment_private_reply_at?: unknown;
  comment_state?: unknown;
  created_at: unknown;
  direction: unknown;
  id: unknown;
  sender_type: unknown;
  sent_at: unknown;
  source?: unknown;
  status: unknown;
  whatsapp_template_language?: unknown;
  whatsapp_template_name?: unknown;
};

/**
 * Lo que se va a enviar, ya resuelto.
 *
 * El texto es la copia visible: para una plantilla no es la carga que viaja al proveedor —esa es la
 * referencia— sino lo que se guarda para que el historial muestre lo mismo que vio el cliente.
 */
type SendIntent = {
  body: string;
  whatsappTemplate: { language: string; name: string } | null;
};

function readWhatsappTemplateReference(message: PersistedMessage): {
  language: string;
  name: string;
} | null {
  return whatsappTemplateReferenceFrom(
    message.whatsapp_template_name,
    message.whatsapp_template_language
  );
}

function normalizeTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new InternalServerErrorException(`El mensaje no tiene ${field} válida.`);
  }
  const timestamp = new Date(value.replace(/([+-]\d{2})$/, '$1:00'));
  if (Number.isNaN(timestamp.getTime())) {
    throw new InternalServerErrorException(`El mensaje no tiene ${field} válida.`);
  }
  return timestamp.toISOString();
}

/**
 * Convierte la multimedia guardada en enlaces entregables. Una copia que no se pudo descargar
 * se entrega sin enlace: el mensaje sigue visible y nunca se pierde por un adjunto.
 */
function readAttachmentRows(message: PersistedMessage): unknown[] {
  return Array.isArray(message.attachments) ? message.attachments : [];
}

function readAttachmentPaths(message: PersistedMessage): string[] {
  return readAttachmentRows(message).flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const path = (row as { storage_object_path?: unknown }).storage_object_path;
    return typeof path === 'string' ? [path] : [];
  });
}

function readAttachments(
  message: PersistedMessage,
  signedUrls: Map<string, string>
): MessageAttachment[] {
  return readAttachmentRows(message).flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const attachment = row as {
      content_type?: unknown;
      id?: unknown;
      kind?: unknown;
      source_title?: unknown;
      storage_object_path?: unknown;
    };
    if (typeof attachment.id !== 'string' || typeof attachment.kind !== 'string') return [];
    const path =
      typeof attachment.storage_object_path === 'string' ? attachment.storage_object_path : null;
    return [
      {
        contentType: typeof attachment.content_type === 'string' ? attachment.content_type : null,
        id: attachment.id,
        kind: attachment.kind as MessageAttachment['kind'],
        title: typeof attachment.source_title === 'string' ? attachment.source_title : null,
        url: path ? (signedUrls.get(path) ?? null) : null
      }
    ];
  });
}

function asConversationMessage(
  message: PersistedMessage,
  signedUrls: Map<string, string>
): ConversationMessage {
  return conversationMessageSchema.parse({
    attachments: readAttachments(message, signedUrls),
    body: message.body,
    commentPrivateReplyAvailable:
      message.source === 'comment' ? message.comment_private_reply_at === null : undefined,
    commentState: message.source === 'comment' ? (message.comment_state ?? 'visible') : undefined,
    createdAt: normalizeTimestamp(message.created_at, 'fecha de creación'),
    direction: message.direction,
    id: message.id,
    senderType: message.sender_type,
    source: message.source,
    sentAt: message.sent_at === null ? null : normalizeTimestamp(message.sent_at, 'fecha de envío'),
    status: message.status,
    whatsappTemplate: readWhatsappTemplateReference(message)
  });
}

function hasZernioChannel(channel: unknown): boolean {
  const relation = Array.isArray(channel) ? channel[0] : channel;
  return Boolean(
    relation &&
      typeof relation === 'object' &&
      'provider' in relation &&
      relation.provider === 'zernio'
  );
}

/**
 * Un canal retirado no envia.
 *
 * Es la misma fila de `channel_accounts` —la historia se conserva a proposito—, pero su cuenta ya no
 * esta conectada en el proveedor. Enviar seria encolar un mensaje condenado.
 */
function isDisconnectedChannel(channel: unknown): boolean {
  const relation = Array.isArray(channel) ? channel[0] : channel;
  return Boolean(
    relation &&
      typeof relation === 'object' &&
      'disconnected_at' in relation &&
      typeof (relation as { disconnected_at?: unknown }).disconnected_at === 'string' &&
      (relation as { disconnected_at: string }).disconnected_at
  );
}

@Injectable()
export class TenantMessageService {
  constructor(
    @Inject(RequestAuthenticator) private readonly requestAuthenticator: RequestAuthenticator,
    @Inject(TenantAccessService) private readonly tenantAccessService: TenantAccessService,
    @Inject(SupabaseServerClientFactory)
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory,
    @Inject(WhatsappTemplateCatalog)
    private readonly whatsappTemplateCatalog: WhatsappTemplateCatalog
  ) {}

  async list(
    authorization: unknown,
    tenantId: string,
    conversationId: string,
    query: ConversationMessageListQuery
  ): Promise<ConversationMessageListResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);
    const supabase = this.supabaseServerClientFactory.create();
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', conversationId)
      .maybeSingle();
    if (conversationError)
      throw new InternalServerErrorException('No fue posible comprobar la conversación.');
    if (!conversation) throw new NotFoundException('La conversación no existe en este tenant.');

    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select(
        'id, body, direction, sender_type, status, sent_at, created_at, source, comment_state, comment_private_reply_at, whatsapp_template_name, whatsapp_template_language, attachments:message_attachments(id, kind, content_type, storage_object_path, source_title)'
      )
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(query.limit);
    if (messagesError)
      throw new InternalServerErrorException('No fue posible cargar el historial.');
    const persistedMessages = (messages ?? []) as PersistedMessage[];
    const signedUrls = await signMediaUrls(
      supabase,
      persistedMessages.flatMap((message) => readAttachmentPaths(message))
    );
    return conversationMessageListResponseSchema.parse({
      items: persistedMessages.map((message) => asConversationMessage(message, signedUrls)),
      nextCursor: null
    });
  }

  async createOutbound(
    authorization: unknown,
    tenantId: string,
    conversationId: string,
    command: CreateOutboundMessage
  ): Promise<CreateOutboundMessageResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);
    return this.enqueueOutbound({
      command,
      conversationId,
      senderType: 'agent',
      senderUserId: identity.userId,
      tenantId
    });
  }

  /**
   * Nucleo del envio saliente.
   *
   * Lo comparten la interfaz —donde quien escribe es la asesora y hay sesion— y las herramientas del
   * bot, donde quien escribe es la automatizacion y no hay sesion de nadie. Todo lo demas es igual:
   * la comprobacion del canal, la idempotencia y el encolado para que el trabajador lo entregue.
   */
  async enqueueOutbound(context: {
    command: CreateOutboundMessage;
    conversationId: string;
    senderType: 'agent' | 'automation';
    senderUserId: string | null;
    tenantId: string;
  }): Promise<CreateOutboundMessageResponse> {
    const { command, conversationId, senderType, senderUserId, tenantId } = context;
    const supabase = this.supabaseServerClientFactory.create();
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, channel_account_id, channel_account:channel_accounts(provider, disconnected_at)')
      .eq('tenant_id', tenantId)
      .eq('id', conversationId)
      .maybeSingle();
    if (conversationError)
      throw new InternalServerErrorException('No fue posible comprobar la conversación.');
    if (!conversation) throw new NotFoundException('La conversación no existe en este tenant.');
    if (!conversation.channel_account_id || !hasZernioChannel(conversation.channel_account)) {
      throw new UnprocessableEntityException(
        'La conversación no tiene un canal Zernio listo para enviar.'
      );
    }
    // Un canal retirado no envia. Se dice con su motivo en lugar de intentarlo contra una cuenta que
    // el proveedor ya no tiene conectada: el mensaje quedaria fallido minutos despues y sin contexto.
    if (isDisconnectedChannel(conversation.channel_account)) {
      throw new UnprocessableEntityException(
        'El canal de esta conversación está retirado: reconéctalo para poder responder.'
      );
    }

    const existing = await this.findByIdempotencyKey(supabase, tenantId, command.idempotencyKey);
    if (existing) return this.resolveIdempotentResult(existing, conversationId, command);

    // Lo que se va a enviar se resuelve ANTES de insertar: una plantilla que no pertenece a esta
    // cuenta, o que exige valores, no puede dejar un mensaje a medias en el historial.
    const intent = await this.resolveSendIntent(tenantId, conversation.channel_account_id, command);

    const { data: created, error: createError } = await supabase
      .from('messages')
      .insert({
        body: intent.body,
        channel_account_id: conversation.channel_account_id,
        conversation_id: conversationId,
        direction: 'outbound',
        idempotency_key: command.idempotencyKey,
        sender_type: senderType,
        sender_user_id: senderUserId,
        sent_at: new Date().toISOString(),
        status: 'queued',
        tenant_id: tenantId,
        whatsapp_template_language: intent.whatsappTemplate?.language ?? null,
        whatsapp_template_name: intent.whatsappTemplate?.name ?? null
      })
      .select(
        'id, body, direction, sender_type, status, sent_at, created_at, source, comment_state, comment_private_reply_at, whatsapp_template_name, whatsapp_template_language, attachments:message_attachments(id, kind, content_type, storage_object_path, source_title)'
      )
      .maybeSingle();
    if (!createError && created) {
      return createOutboundMessageResponseSchema.parse({
        item: asConversationMessage(created as PersistedMessage, new Map())
      });
    }
    if (createError?.code === '23505') {
      const raced = await this.findByIdempotencyKey(supabase, tenantId, command.idempotencyKey);
      if (raced) return this.resolveIdempotentResult(raced, conversationId, command);
    }
    throw new InternalServerErrorException('No fue posible preparar el mensaje para envío.');
  }

  private async findByIdempotencyKey(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    idempotencyKey: string
  ): Promise<(PersistedMessage & { conversation_id: string }) | null> {
    const { data, error } = await supabase
      .from('messages')
      .select(
        'id, body, direction, sender_type, status, sent_at, created_at, source, conversation_id, whatsapp_template_name, whatsapp_template_language'
      )
      .eq('tenant_id', tenantId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (error)
      throw new InternalServerErrorException(
        'No fue posible comprobar la idempotencia del mensaje.'
      );
    return (data as (PersistedMessage & { conversation_id: string }) | null) ?? null;
  }

  /**
   * Traduce el comando a lo que se guarda y se despacha.
   *
   * Para un texto es el propio texto. Para una plantilla hay que comprobar que pertenece al catalogo
   * de ESA cuenta y que se puede enviar: si no, se rechaza aqui y no se encola nada. La copia visible
   * la escribe el servidor desde la definicion aprobada; lo que viaja al proveedor es la referencia.
   */
  private async resolveSendIntent(
    tenantId: string,
    channelAccountId: string,
    command: CreateOutboundMessage
  ): Promise<SendIntent> {
    if (command.kind !== 'whatsapp_template') return { body: command.body, whatsappTemplate: null };

    const catalogo = await this.whatsappTemplateCatalog.readForChannelAccount(
      tenantId,
      channelAccountId
    );
    if (!catalogo) {
      throw new UnprocessableEntityException(
        'La conversación no tiene una cuenta de WhatsApp lista para enviar.'
      );
    }

    const plantilla = findWhatsappTemplateByReference(catalogo.templates, command.whatsappTemplate);
    if (!plantilla) {
      throw new UnprocessableEntityException(
        'Esa plantilla no está aprobada en la cuenta de WhatsApp de esta conversación.'
      );
    }

    const envio = whatsappTemplateSendability(plantilla);
    if (!envio.sendable) {
      throw new UnprocessableEntityException(
        envio.reason === 'not_approved'
          ? 'Meta todavía no tiene aprobada esa plantilla.'
          : envio.reason === 'missing_language'
            ? 'Meta no informó el idioma de esa plantilla, así que no se puede resolver.'
            : `Esa plantilla necesita valores para ${plantilla.variables.join(', ')} y este envío no los captura.`
      );
    }

    return {
      body: plantilla.previewText,
      whatsappTemplate: { language: command.whatsappTemplate.language, name: plantilla.name }
    };
  }

  /**
   * Compara un mensaje ya guardado con el comando recibido.
   *
   * Una clave de idempotencia repetida solo es valida si describe el MISMO envio: mismo destino y
   * misma carga. Se compara contra lo guardado —referencia incluida— y no contra el catalogo, para
   * que un reintento no dependa de una lectura al proveedor.
   */
  private matchesCommand(
    existing: PersistedMessage & { conversation_id: string },
    conversationId: string,
    command: CreateOutboundMessage
  ): boolean {
    if (existing.conversation_id !== conversationId || existing.direction !== 'outbound') {
      return false;
    }
    const referencia = readWhatsappTemplateReference(existing);
    if (command.kind === 'whatsapp_template') {
      return (
        referencia?.name === command.whatsappTemplate.name &&
        referencia.language === command.whatsappTemplate.language
      );
    }
    return referencia === null && existing.body === command.body;
  }

  private resolveIdempotentResult(
    existing: PersistedMessage & { conversation_id: string },
    conversationId: string,
    command: CreateOutboundMessage
  ): CreateOutboundMessageResponse {
    if (!this.matchesCommand(existing, conversationId, command)) {
      throw new ConflictException('La clave de idempotencia ya fue usada para otro mensaje.');
    }
    return createOutboundMessageResponseSchema.parse({
      item: asConversationMessage(existing, new Map())
    });
  }
}
