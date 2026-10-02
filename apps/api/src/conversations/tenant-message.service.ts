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
import { RequestAuthenticator } from '../auth/request-authenticator';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantAccessService } from '../tenants/tenant-access.service';
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
};

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
    status: message.status
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

@Injectable()
export class TenantMessageService {
  constructor(
    @Inject(RequestAuthenticator) private readonly requestAuthenticator: RequestAuthenticator,
    @Inject(TenantAccessService) private readonly tenantAccessService: TenantAccessService,
    @Inject(SupabaseServerClientFactory)
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
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
        'id, body, direction, sender_type, status, sent_at, created_at, source, comment_state, comment_private_reply_at, attachments:message_attachments(id, kind, content_type, storage_object_path, source_title)'
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
    const supabase = this.supabaseServerClientFactory.create();
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id, channel_account_id, channel_account:channel_accounts(provider)')
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

    const existing = await this.findByIdempotencyKey(supabase, tenantId, command.idempotencyKey);
    if (existing) return this.resolveIdempotentResult(existing, conversationId, command);

    const { data: created, error: createError } = await supabase
      .from('messages')
      .insert({
        body: command.body,
        channel_account_id: conversation.channel_account_id,
        conversation_id: conversationId,
        direction: 'outbound',
        idempotency_key: command.idempotencyKey,
        sender_type: 'agent',
        sender_user_id: identity.userId,
        sent_at: new Date().toISOString(),
        status: 'queued',
        tenant_id: tenantId
      })
      .select(
        'id, body, direction, sender_type, status, sent_at, created_at, source, comment_state, comment_private_reply_at, attachments:message_attachments(id, kind, content_type, storage_object_path, source_title)'
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
        'id, body, direction, sender_type, status, sent_at, created_at, source, conversation_id'
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

  private resolveIdempotentResult(
    existing: PersistedMessage & { conversation_id: string },
    conversationId: string,
    command: CreateOutboundMessage
  ): CreateOutboundMessageResponse {
    if (
      existing.conversation_id !== conversationId ||
      existing.direction !== 'outbound' ||
      existing.body !== command.body
    ) {
      throw new ConflictException('La clave de idempotencia ya fue usada para otro mensaje.');
    }
    return createOutboundMessageResponseSchema.parse({
      item: asConversationMessage(existing, new Map())
    });
  }
}
