import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException
} from '@nestjs/common';
import {
  mediaListResponseSchema,
  type AttachmentKind,
  type MediaListQuery,
  type MediaListResponse
} from '@chat-zernio/contracts';
import { decodeMediaCursor, encodeMediaCursor, sanitizeSearchTerm } from '@chat-zernio/domain';
import { RequestAuthenticator } from '../auth/request-authenticator';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantAccessService } from '../tenants/tenant-access.service';

export const MEDIA_BUCKET = 'conversation-media';
const SIGNED_URL_TTL_SECONDS = 600;
const DEFAULT_PAGE_SIZE = 30;
const SEARCH_CONTACT_LIMIT = 50;

const mediaSelection =
  'id, conversation_id, message_id, kind, content_type, created_at, storage_object_path, source_title, conversation:conversations(contact_id, contact:contacts(display_name))';

type PersistedAttachment = {
  content_type: unknown;
  conversation: unknown;
  conversation_id: unknown;
  created_at: unknown;
  id: unknown;
  kind: unknown;
  message_id: unknown;
  source_title?: unknown;
  storage_object_path: unknown;
};

/**
 * Firma en lote las copias propias. El bucket es privado y su ruta interna nunca sale al
 * cliente: solo se entrega un enlace temporal.
 */
export async function signMediaUrls(
  supabase: ReturnType<SupabaseServerClientFactory['create']>,
  paths: string[]
): Promise<Map<string, string>> {
  const uniquePaths = [...new Set(paths.filter((path) => path.length > 0))];
  const signed = new Map<string, string>();
  if (uniquePaths.length === 0) return signed;

  const { data, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(uniquePaths, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return signed;

  for (const entry of data) {
    const path = (entry as { path?: unknown }).path;
    const signedUrl = (entry as { signedUrl?: unknown }).signedUrl;
    if (typeof path === 'string' && typeof signedUrl === 'string') {
      signed.set(path, signedUrl);
    }
  }
  return signed;
}

function readContactName(conversation: unknown): { contactId: string; contactName: string } | null {
  const relation = Array.isArray(conversation) ? conversation[0] : conversation;
  if (!relation || typeof relation !== 'object') return null;
  const contact = (relation as { contact?: unknown }).contact;
  const contactRelation = Array.isArray(contact) ? contact[0] : contact;
  if (!contactRelation || typeof contactRelation !== 'object') return null;
  const displayName = (contactRelation as { display_name?: unknown }).display_name;
  const contactId = (relation as { contact_id?: unknown }).contact_id;
  if (typeof contactId !== 'string' || typeof displayName !== 'string') return null;
  return { contactId, contactName: displayName };
}

function normalizeTimestamp(value: unknown): string {
  if (typeof value !== 'string') {
    throw new InternalServerErrorException('El adjunto no tiene una fecha válida.');
  }
  const timestamp = new Date(value.replace(/([+-]\d{2})$/, '$1:00'));
  if (Number.isNaN(timestamp.getTime())) {
    throw new InternalServerErrorException('El adjunto no tiene una fecha válida.');
  }
  return timestamp.toISOString();
}

@Injectable()
export class ConversationMediaService {
  constructor(
    @Inject(RequestAuthenticator) private readonly requestAuthenticator: RequestAuthenticator,
    @Inject(TenantAccessService) private readonly tenantAccessService: TenantAccessService,
    @Inject(SupabaseServerClientFactory)
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  async list(
    authorization: unknown,
    tenantId: string,
    query: MediaListQuery
  ): Promise<MediaListResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);
    const supabase = this.supabaseServerClientFactory.create();

    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    let request = supabase
      .from('message_attachments')
      .select(mediaSelection)
      .eq('tenant_id', tenantId);

    if (query.kind) request = request.eq('kind', query.kind);

    if (query.search !== undefined) {
      // Se resuelve en dos pasos, igual que la búsqueda de la bandeja, para no depender de
      // filtros sobre relaciones anidadas.
      const term = sanitizeSearchTerm(query.search);
      if (!term) return mediaListResponseSchema.parse({ items: [], nextCursor: null });

      const { data: contacts, error: contactError } = await supabase
        .from('contacts')
        .select('id')
        .eq('tenant_id', tenantId)
        .ilike('display_name', `%${term}%`)
        .limit(SEARCH_CONTACT_LIMIT);
      if (contactError) {
        throw new InternalServerErrorException('No fue posible buscar la multimedia.');
      }
      const contactIds = (contacts ?? []).flatMap((contact) =>
        typeof contact.id === 'string' ? [contact.id] : []
      );
      if (contactIds.length === 0) {
        return mediaListResponseSchema.parse({ items: [], nextCursor: null });
      }

      const { data: conversations, error: conversationError } = await supabase
        .from('conversations')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('contact_id', contactIds);
      if (conversationError) {
        throw new InternalServerErrorException('No fue posible buscar la multimedia.');
      }
      const conversationIds = (conversations ?? []).flatMap((conversation) =>
        typeof conversation.id === 'string' ? [conversation.id] : []
      );
      if (conversationIds.length === 0) {
        return mediaListResponseSchema.parse({ items: [], nextCursor: null });
      }

      request = request.in('conversation_id', conversationIds);
    }

    if (query.cursor) {
      const cursor = decodeMediaCursor(query.cursor);
      if (!cursor) throw new BadRequestException('El cursor de multimedia no es válido.');
      request = request.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
      );
    }

    const { data, error } = await request
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    if (error) {
      throw new InternalServerErrorException('No fue posible cargar la multimedia.');
    }

    const rows = (data ?? []) as PersistedAttachment[];
    const page = rows.slice(0, limit);
    const signed = await signMediaUrls(
      supabase,
      page.flatMap((row) =>
        typeof row.storage_object_path === 'string' ? [row.storage_object_path] : []
      )
    );

    const items = page.map((row) => {
      const contact = readContactName(row.conversation);
      if (!contact) {
        throw new InternalServerErrorException('La conversación del adjunto no tiene contacto.');
      }
      const path = typeof row.storage_object_path === 'string' ? row.storage_object_path : null;
      return {
        contactId: contact.contactId,
        contactName: contact.contactName,
        contentType: typeof row.content_type === 'string' ? row.content_type : null,
        conversationId: row.conversation_id,
        createdAt: normalizeTimestamp(row.created_at),
        id: row.id,
        kind: row.kind as AttachmentKind,
        messageId: row.message_id,
        title: typeof row.source_title === 'string' ? row.source_title : null,
        url: path ? (signed.get(path) ?? null) : null
      };
    });

    const last = page.at(-1);
    const nextCursor =
      rows.length > limit && last
        ? encodeMediaCursor({
            createdAt: normalizeTimestamp(last.created_at),
            id: String(last.id)
          })
        : null;

    return mediaListResponseSchema.parse({ items, nextCursor });
  }
}
