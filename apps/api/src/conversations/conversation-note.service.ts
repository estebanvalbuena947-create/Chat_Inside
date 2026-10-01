import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from '@nestjs/common';
import {
  conversationNoteListResponseSchema,
  conversationNoteMutationResponseSchema,
  conversationNoteSchema,
  type ConversationNote,
  type ConversationNoteListResponse,
  type ConversationNoteMutationResponse,
  type CreateConversationNote
} from '@chat-zernio/contracts';
import { RequestAuthenticator } from '../auth/request-authenticator';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantAccessService } from '../tenants/tenant-access.service';

type PersistedConversationNote = {
  body: unknown;
  conversation_id: unknown;
  created_at: unknown;
  created_by_user_id: unknown;
  id: unknown;
  idempotency_key: unknown;
};

function normalizeTimestamp(value: unknown): string {
  if (typeof value !== 'string') {
    throw new InternalServerErrorException('La nota no tiene una fecha valida.');
  }
  const timestamp = new Date(value.replace(/([+-]\d{2})$/, '$1:00'));
  if (Number.isNaN(timestamp.getTime())) {
    throw new InternalServerErrorException('La nota no tiene una fecha valida.');
  }
  return timestamp.toISOString();
}

function asConversationNote(note: PersistedConversationNote): ConversationNote {
  return conversationNoteSchema.parse({
    body: note.body,
    createdAt: normalizeTimestamp(note.created_at),
    createdByUserId: note.created_by_user_id,
    id: note.id
  });
}

@Injectable()
export class ConversationNoteService {
  constructor(
    @Inject(RequestAuthenticator) private readonly requestAuthenticator: RequestAuthenticator,
    @Inject(TenantAccessService) private readonly tenantAccessService: TenantAccessService,
    @Inject(SupabaseServerClientFactory)
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  async list(
    authorization: unknown,
    tenantId: string,
    conversationId: string
  ): Promise<ConversationNoteListResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);
    const supabase = this.supabaseServerClientFactory.create();
    await this.assertConversation(supabase, tenantId, conversationId);
    const { data, error } = await supabase
      .from('conversation_notes')
      .select('id, body, created_by_user_id, created_at, idempotency_key')
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) throw new InternalServerErrorException('No fue posible cargar las notas privadas.');
    return conversationNoteListResponseSchema.parse({
      items: (data ?? []).map((note) => asConversationNote(note as PersistedConversationNote))
    });
  }

  async create(
    authorization: unknown,
    tenantId: string,
    conversationId: string,
    command: CreateConversationNote
  ): Promise<ConversationNoteMutationResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);
    const supabase = this.supabaseServerClientFactory.create();
    await this.assertConversation(supabase, tenantId, conversationId);

    const existing = await this.findByIdempotencyKey(supabase, tenantId, command.idempotencyKey);
    if (existing) return this.resolveIdempotentCreate(existing, command, conversationId);

    const { data, error } = await supabase
      .from('conversation_notes')
      .insert({
        body: command.body,
        conversation_id: conversationId,
        created_by_user_id: identity.userId,
        idempotency_key: command.idempotencyKey,
        tenant_id: tenantId
      })
      .select('id, body, created_by_user_id, created_at, idempotency_key')
      .maybeSingle();
    if (!error && data) {
      return conversationNoteMutationResponseSchema.parse({
        item: asConversationNote(data as PersistedConversationNote)
      });
    }
    if (error?.code === '23505') {
      const raced = await this.findByIdempotencyKey(supabase, tenantId, command.idempotencyKey);
      if (raced) return this.resolveIdempotentCreate(raced, command, conversationId);
    }
    throw new InternalServerErrorException('No fue posible guardar la nota privada.');
  }

  private async assertConversation(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    conversationId: string
  ): Promise<void> {
    const { data, error } = await supabase
      .from('conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', conversationId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('No fue posible comprobar la conversacion.');
    if (!data) throw new NotFoundException('La conversacion no existe en este tenant.');
  }

  private async findByIdempotencyKey(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    idempotencyKey: string
  ): Promise<PersistedConversationNote | null> {
    const { data, error } = await supabase
      .from('conversation_notes')
      .select('id, body, created_by_user_id, created_at, idempotency_key, conversation_id')
      .eq('tenant_id', tenantId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('No fue posible comprobar la nota privada.');
    return data ? (data as PersistedConversationNote) : null;
  }

  private resolveIdempotentCreate(
    existing: PersistedConversationNote,
    command: CreateConversationNote,
    conversationId: string
  ): ConversationNoteMutationResponse {
    if (existing.body !== command.body || existing.conversation_id !== conversationId) {
      throw new ConflictException('La clave de la nota ya fue usada para otra solicitud.');
    }
    return conversationNoteMutationResponseSchema.parse({ item: asConversationNote(existing) });
  }
}
