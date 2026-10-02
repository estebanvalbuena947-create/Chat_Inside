import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import {
  clampReadMark,
  decodeInboxCursor,
  encodeInboxCursor,
  needsAttention,
  nextReadMark,
  sanitizeSearchTerm,
  type InboxCursor
} from '@chat-zernio/domain';
import {
  conversationListResponseSchema,
  conversationSummarySchema,
  markConversationReadResponseSchema,
  updateConversationAutomationResponseSchema,
  updateConversationAssignmentResponseSchema,
  updateConversationStatusResponseSchema,
  type ConversationListQuery,
  type ConversationListResponse,
  type ConversationSummary,
  type MarkConversationRead,
  type MarkConversationReadResponse,
  type UpdateConversationAutomation,
  type UpdateConversationAutomationResponse,
  type UpdateConversationAssignment,
  type UpdateConversationAssignmentResponse,
  type UpdateConversationStatus,
  type UpdateConversationStatusResponse
} from '@chat-zernio/contracts';
import { validateWonOutcome } from '@chat-zernio/domain';
import {
  conversationWonResponseSchema,
  markConversationWonSchema,
  type ConversationWonResponse
} from '@chat-zernio/contracts';
import { RequestAuthenticator } from '../auth/request-authenticator';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantAccessService } from '../tenants/tenant-access.service';

type ContactProfile = {
  avatarAvailable: boolean;
  name: string;
  username: string | null;
};

function readContactProfile(contact: unknown): ContactProfile {
  const relation = Array.isArray(contact) ? contact[0] : contact;

  if (
    !relation ||
    typeof relation !== 'object' ||
    !('display_name' in relation) ||
    typeof relation.display_name !== 'string'
  ) {
    throw new InternalServerErrorException('La conversación no tiene un contacto válido.');
  }

  return {
    avatarAvailable:
      'avatar_object_path' in relation && typeof relation.avatar_object_path === 'string',
    name: relation.display_name,

    username:
      'external_username' in relation && typeof relation.external_username === 'string'
        ? relation.external_username
        : null
  };
}

function readChannelPlatform(channelAccount: unknown): string | null {
  const relation = Array.isArray(channelAccount) ? channelAccount[0] : channelAccount;

  if (!relation || typeof relation !== 'object' || !('platform' in relation)) {
    return null;
  }

  return typeof relation.platform === 'string' && relation.platform.trim()
    ? relation.platform.trim()
    : null;
}

function normalizeTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new InternalServerErrorException(`La conversaciÃ³n no tiene ${field} vÃ¡lido.`);
  }

  const timestamp = new Date(value.replace(/([+-]\d{2})$/, '$1:00'));
  if (Number.isNaN(timestamp.getTime())) {
    throw new InternalServerErrorException(`La conversaciÃ³n no tiene ${field} vÃ¡lido.`);
  }

  return timestamp.toISOString();
}

function normalizeNullableTimestamp(value: unknown, field: string): string | null {
  return value === null ? null : normalizeTimestamp(value, field);
}

type PersistedConversation = {
  assignment_version: unknown;
  assigned_user_id: unknown;
  automation_mode: unknown;
  automation_version: unknown;
  channel_account: unknown;
  contact: unknown;
  contact_id: unknown;
  id: unknown;
  inbound?: unknown;
  last_message_at: unknown;
  started_at?: unknown;
  latest?: unknown;
  read?: unknown;
  status: unknown;
  status_version: unknown;
  updated_at: unknown;
};

type LatestMessage = {
  body: string;
  createdAt: string;
  direction: 'inbound' | 'outbound';
};

function firstRelation(value: unknown): Record<string, unknown> | null {
  const relation = Array.isArray(value) ? value[0] : value;
  if (!relation || typeof relation !== 'object') return null;
  return relation as Record<string, unknown>;
}

function readLatestMessage(value: unknown): LatestMessage | null {
  const relation = firstRelation(value);
  if (!relation) return null;
  if (typeof relation.body !== 'string' || typeof relation.created_at !== 'string') return null;
  if (relation.direction !== 'inbound' && relation.direction !== 'outbound') return null;

  return {
    body: relation.body,
    createdAt: normalizeTimestamp(relation.created_at, 'una fecha de mensaje'),
    direction: relation.direction
  };
}

function readMessageCreatedAt(value: unknown): string | null {
  const relation = firstRelation(value);
  if (!relation || typeof relation.created_at !== 'string') return null;
  return normalizeTimestamp(relation.created_at, 'una fecha de mensaje');
}

function readLastReadAt(value: unknown): string | null {
  const relation = firstRelation(value);
  if (!relation || typeof relation.last_read_at !== 'string') return null;
  return normalizeTimestamp(relation.last_read_at, 'una fecha de lectura');
}

const PREVIEW_MAX_LENGTH = 200;

/**
 * La vista previa es un dato de lectura acotado: nunca se transporta el cuerpo completo
 * de un mensaje en el listado, y un mensaje sin texto visible no produce vista previa.
 */
function buildPreview(latest: LatestMessage | null): string | null {
  if (!latest) return null;
  const text = latest.body.trim();
  if (!text) return null;
  return text.slice(0, PREVIEW_MAX_LENGTH);
}

function asConversationSummary(conversation: PersistedConversation): ConversationSummary {
  const contact = readContactProfile(conversation.contact);
  const latest = readLatestMessage(conversation.latest);
  const lastInboundAt = readMessageCreatedAt(conversation.inbound);
  const lastReadAt = readLastReadAt(conversation.read);

  return conversationSummarySchema.parse({
    assignmentVersion: conversation.assignment_version,
    assignedUserId: conversation.assigned_user_id,
    automationMode: conversation.automation_mode,
    automationVersion: conversation.automation_version,
    channelPlatform: readChannelPlatform(conversation.channel_account),
    contactAvatarAvailable: contact.avatarAvailable,
    contactId: conversation.contact_id,
    contactName: contact.name,
    contactUsername: contact.username,
    id: conversation.id,
    startedAt:
      conversation.started_at === null || conversation.started_at === undefined
        ? null
        : normalizeNullableTimestamp(conversation.started_at, 'una fecha de inicio'),
    lastMessageAt: normalizeNullableTimestamp(
      conversation.last_message_at,
      'una fecha de último mensaje'
    ),
    lastMessageDirection: latest?.direction ?? null,
    lastMessagePreview: buildPreview(latest),
    needsAttention: needsAttention(lastReadAt, lastInboundAt),
    status: conversation.status,
    statusVersion: conversation.status_version,
    updatedAt: normalizeTimestamp(conversation.updated_at, 'una fecha de actualización')
  });
}

const conversationSummarySelection =
  'id, contact_id, assigned_user_id, status, status_version, assignment_version, automation_mode, automation_version, last_message_at, started_at, updated_at, contact:contacts(display_name, external_username, avatar_object_path), channel_account:channel_accounts(platform), latest:messages(body, direction, created_at), inbound:messages(created_at), read:conversation_reads(last_read_at)';

type EmbeddedQuery = {
  eq: (column: string, value: string) => EmbeddedQuery;
  limit: (count: number, options: { foreignTable: string }) => EmbeddedQuery;
  order: (column: string, options: { ascending: boolean; foreignTable: string }) => EmbeddedQuery;
};

/**
 * Toda consulta que use `conversationSummarySelection` debe acotar sus relaciones embebidas:
 * el ultimo mensaje, el ultimo entrante y la marca de lectura de la persona solicitante.
 * Sin este acotado, una conversacion con cientos de mensajes devolveria todos sus mensajes.
 */
function withLatestMessageEmbed<T>(query: T): T {
  return (query as unknown as EmbeddedQuery)
    .order('created_at', { ascending: false, foreignTable: 'latest' })
    .limit(1, { foreignTable: 'latest' }) as unknown as T;
}

function withAttentionEmbeds<T>(query: T, userId: string): T {
  return (withLatestMessageEmbed(query) as unknown as EmbeddedQuery)
    .order('created_at', { ascending: false, foreignTable: 'inbound' })
    .limit(1, { foreignTable: 'inbound' })
    .eq('read.user_id', userId)
    .limit(1, { foreignTable: 'read' }) as unknown as T;
}

type KeysetQuery = {
  is: (column: string, value: null) => KeysetQuery;
  lt: (column: string, value: string) => KeysetQuery;
  or: (filter: string) => KeysetQuery;
};

/**
 * Continuacion por cursor sobre `(last_message_at desc nulls last, id desc)`. Las
 * conversaciones sin mensajes viven en la cola de nulos y se desempatan por identificador.
 */
/**
 * Separa las conversaciones de mensajes directos de las que solo tienen comentarios.
 *
 * Es opcional a proposito: sin `kind` se devuelve todo, para que la bandeja nunca dependa de
 * este filtro para cargar. El origen lo mantiene el trabajador al guardar cada mensaje.
 */
/**
 * Cuentas de canal de una plataforma dentro del espacio.
 *
 * El listado se filtra por esas cuentas porque la plataforma vive en la cuenta, no en la
 * conversacion. Sin coincidencias se devuelve una lista vacia, no todo.
 */
async function findChannelAccountIdsForPlatform(
  supabase: ReturnType<SupabaseServerClientFactory['create']>,
  tenantId: string,
  platform: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('channel_accounts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('platform', platform);
  if (error) throw new InternalServerErrorException('No fue posible filtrar por plataforma.');

  return (data ?? []).flatMap((row) => (typeof row.id === 'string' ? [row.id] : []));
}
function applyConversationKind<T>(query: T, kind: 'messages' | 'comments' | undefined): T {
  if (!kind) return query;
  const scoped = query as unknown as { eq: (column: string, value: boolean) => T };
  return scoped.eq('has_dm', kind === 'messages');
}
function applyInboxKeyset<T>(query: T, cursor: InboxCursor): T {
  const scoped = query as unknown as KeysetQuery;
  if (!cursor.lastMessageAt) {
    return scoped.is('last_message_at', null).lt('id', cursor.id) as unknown as T;
  }

  return scoped.or(
    `last_message_at.lt.${cursor.lastMessageAt},and(last_message_at.eq.${cursor.lastMessageAt},id.lt.${cursor.id})`
  ) as unknown as T;
}

@Injectable()
export class TenantConversationService {
  constructor(
    @Inject(RequestAuthenticator) private readonly requestAuthenticator: RequestAuthenticator,
    @Inject(TenantAccessService) private readonly tenantAccessService: TenantAccessService,
    @Inject(SupabaseServerClientFactory)
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  async list(
    authorization: unknown,
    tenantId: string,
    query: ConversationListQuery
  ): Promise<ConversationListResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);

    const cursor = query.cursor ? decodeInboxCursor(query.cursor) : null;
    if (query.cursor && !cursor) {
      throw new BadRequestException('El cursor de la bandeja no es válido.');
    }

    const supabase = this.supabaseServerClientFactory.create();
    let conversationIdsForLabel: string[] | null = null;
    if (query.labelId) {
      await this.assertLabelBelongsToTenant(supabase, tenantId, query.labelId);
      conversationIdsForLabel = await this.findConversationIdsForLabel(
        supabase,
        tenantId,
        query.labelId
      );
      if (conversationIdsForLabel.length === 0) {
        return conversationListResponseSchema.parse({ items: [], nextCursor: null });
      }
    }

    let channelAccountIdsForPlatform: string[] | null = null;
    if (query.platform) {
      channelAccountIdsForPlatform = await findChannelAccountIdsForPlatform(
        supabase,
        tenantId,
        query.platform
      );
      if (channelAccountIdsForPlatform.length === 0) {
        return conversationListResponseSchema.parse({ items: [], nextCursor: null });
      }
    }
    const searchTerm = sanitizeSearchTerm(query.search);
    let contactIdsForSearch: string[] | null = null;
    if (searchTerm) {
      contactIdsForSearch = await this.findContactIdsForSearch(supabase, tenantId, searchTerm);
      if (contactIdsForSearch.length === 0) {
        return conversationListResponseSchema.parse({ items: [], nextCursor: null });
      }
    }

    // Una conversacion deja de ser solo comentarios en cuanto llega su primer mensaje
    // directo: el origen se mantiene al guardar cada mensaje y no depende del orden.

    const conversationsQuery = applyConversationKind(
      withAttentionEmbeds(
        supabase
          .from('conversations')
          .select(conversationSummarySelection)
          .eq('tenant_id', tenantId),
        identity.userId
      ),
      query.kind
    );
    const platformScopedConversationsQuery = channelAccountIdsForPlatform
      ? conversationsQuery.in('channel_account_id', channelAccountIdsForPlatform)
      : conversationsQuery;
    const labelledConversationsQuery = conversationIdsForLabel
      ? platformScopedConversationsQuery.in('id', conversationIdsForLabel)
      : platformScopedConversationsQuery;
    const scopedConversationsQuery =
      query.assignmentScope === 'assigned_to_me'
        ? labelledConversationsQuery.eq('assigned_user_id', identity.userId)
        : labelledConversationsQuery;
    const searchedConversationsQuery = contactIdsForSearch
      ? scopedConversationsQuery.in('contact_id', contactIdsForSearch)
      : scopedConversationsQuery;
    const keyedConversationsQuery = cursor
      ? applyInboxKeyset(searchedConversationsQuery, cursor)
      : searchedConversationsQuery;

    // Se pide un elemento adicional para saber si existe una pagina siguiente sin contar filas.
    const { data: conversations, error: conversationsError } = await keyedConversationsQuery
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .limit(query.limit + 1);

    if (conversationsError) {
      throw new InternalServerErrorException('No fue posible cargar las conversaciones.');
    }

    const rows = (conversations ?? []) as PersistedConversation[];
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const lastRow = page.at(-1) ?? null;

    return conversationListResponseSchema.parse({
      items: page.map((conversation) => asConversationSummary(conversation)),
      nextCursor:
        hasMore && lastRow
          ? encodeInboxCursor({
              id: String(lastRow.id),
              lastMessageAt:
                lastRow.last_message_at === null
                  ? null
                  : normalizeTimestamp(lastRow.last_message_at, 'una fecha de último mensaje')
            })
          : null
    });
  }

  async markRead(
    authorization: unknown,
    tenantId: string,
    conversationId: string,
    input: MarkConversationRead
  ): Promise<MarkConversationReadResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);

    const supabase = this.supabaseServerClientFactory.create();
    const { data: conversation, error: conversationError } = await withLatestMessageEmbed(
      supabase
        .from('conversations')
        .select('id, latest:messages(created_at)')
        .eq('tenant_id', tenantId)
        .eq('id', conversationId)
    ).maybeSingle();

    if (conversationError) {
      throw new InternalServerErrorException('No fue posible comprobar la conversación.');
    }
    if (!conversation) {
      throw new NotFoundException('La conversación no existe en este tenant.');
    }

    const newestMessageAt = readMessageCreatedAt((conversation as PersistedConversation).latest);
    const bounded = newestMessageAt ? clampReadMark(input.upTo, newestMessageAt) : null;
    const currentMark = await this.readReadMark(
      supabase,
      tenantId,
      conversationId,
      identity.userId
    );

    // Sin mensajes no hay nada que marcar: se devuelve la marca vigente sin inventar una nueva.
    if (!bounded) {
      return markConversationReadResponseSchema.parse({
        item: { conversationId, lastReadAt: currentMark }
      });
    }

    const decision = nextReadMark(currentMark, bounded);
    if (!decision.advance) {
      return markConversationReadResponseSchema.parse({
        item: { conversationId, lastReadAt: decision.mark }
      });
    }

    if (currentMark) {
      const { data: updated, error: updateError } = await supabase
        .from('conversation_reads')
        .update({ last_read_at: decision.mark, updated_at: new Date().toISOString() })
        .eq('tenant_id', tenantId)
        .eq('conversation_id', conversationId)
        .eq('user_id', identity.userId)
        .lt('last_read_at', decision.mark)
        .select('last_read_at')
        .maybeSingle();

      if (updateError) {
        throw new InternalServerErrorException('No fue posible guardar la marca de lectura.');
      }
      if (updated) {
        return markConversationReadResponseSchema.parse({
          item: { conversationId, lastReadAt: decision.mark }
        });
      }

      // Otra pestaña o proceso adelantó la marca: se devuelve la vigente.
      const advanced = await this.readReadMark(supabase, tenantId, conversationId, identity.userId);
      return markConversationReadResponseSchema.parse({
        item: { conversationId, lastReadAt: advanced ?? decision.mark }
      });
    }

    const { error: insertError } = await supabase.from('conversation_reads').insert({
      conversation_id: conversationId,
      last_read_at: decision.mark,
      tenant_id: tenantId,
      user_id: identity.userId
    });
    if (insertError && insertError.code !== '23505') {
      throw new InternalServerErrorException('No fue posible guardar la marca de lectura.');
    }

    const stored = insertError
      ? await this.readReadMark(supabase, tenantId, conversationId, identity.userId)
      : decision.mark;

    return markConversationReadResponseSchema.parse({
      item: { conversationId, lastReadAt: stored ?? decision.mark }
    });
  }

  private async readReadMark(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    conversationId: string,
    userId: string
  ): Promise<string | null> {
    const { data, error } = await supabase
      .from('conversation_reads')
      .select('last_read_at')
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException('No fue posible comprobar la marca de lectura.');
    }

    return readLastReadAt(data);
  }

  private async findContactIdsForSearch(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    term: string
  ): Promise<string[]> {
    const pattern = `*${term}*`;
    const { data, error } = await supabase
      .from('contacts')
      .select('id')
      .eq('tenant_id', tenantId)
      .or(`display_name.ilike.${pattern},external_username.ilike.${pattern}`);

    if (error) {
      throw new InternalServerErrorException('No fue posible resolver la búsqueda de la bandeja.');
    }

    return (data ?? []).flatMap((item) => (typeof item.id === 'string' ? [item.id] : []));
  }

  private async assertLabelBelongsToTenant(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    labelId: string
  ): Promise<void> {
    const { data, error } = await supabase
      .from('labels')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', labelId)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException('No fue posible comprobar la etiqueta del filtro.');
    }
    if (!data) {
      throw new NotFoundException('La etiqueta no existe en este tenant.');
    }
  }

  private async findConversationIdsForLabel(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    labelId: string
  ): Promise<string[]> {
    const { data, error } = await supabase
      .from('conversation_labels')
      .select('conversation_id')
      .eq('tenant_id', tenantId)
      .eq('label_id', labelId);
    if (error) {
      throw new InternalServerErrorException('No fue posible aplicar el filtro de etiqueta.');
    }
    return (data ?? []).flatMap((item) =>
      typeof item.conversation_id === 'string' ? [item.conversation_id] : []
    );
  }

  /**
   * Marca la conversacion como ganada, con el valor total del servicio (no el deposito).
   *
   * Es el hecho de negocio explicito que exige Meta para aceptar una conversion: una persona o el
   * bot lo registran, y queda quien fue y cuando. La base impone ademas que un negocio ganado traiga
   * siempre valor, origen y fecha.
   */
  async markWon(
    authorization: unknown,
    tenantId: string,
    conversationId: string,
    rawBody: unknown
  ): Promise<ConversationWonResponse> {
    const parsed = markConversationWonSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new UnprocessableEntityException(
        'La conversacion ganada necesita un importe y una moneda de tres letras.'
      );
    }

    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);

    const revision = validateWonOutcome({
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      recordedAt: new Date(),
      recordedBy: 'persona',
      recordedByUserId: identity.userId
    });
    if (!revision.ok) {
      throw new UnprocessableEntityException(revision.reason);
    }
    const ahora = new Date().toISOString();
    const { data, error } = await this.supabaseServerClientFactory
      .create()
      .from('conversations')
      .update({
        outcome: 'ganado',
        outcome_amount: parsed.data.amount,
        outcome_currency: parsed.data.currency,
        outcome_set_at: ahora,
        outcome_set_by: 'persona',
        outcome_set_by_user_id: identity.userId,
        updated_at: ahora
      })
      .eq('tenant_id', tenantId)
      .eq('id', conversationId)
      .select('id, outcome, outcome_amount, outcome_currency, outcome_set_at')
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException('No fue posible registrar la conversacion ganada.');
    }
    if (!data) {
      throw new NotFoundException('La conversacion no existe en este espacio.');
    }

    return conversationWonResponseSchema.parse({
      amount: Number(data.outcome_amount),
      conversationId: String(data.id),
      currency: String(data.outcome_currency),
      outcome: 'ganado',
      setAt: String(data.outcome_set_at)
    });
  }

  async changeStatus(
    authorization: unknown,
    tenantId: string,
    conversationId: string,
    input: UpdateConversationStatus
  ): Promise<UpdateConversationStatusResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);
    const supabase = this.supabaseServerClientFactory.create();
    const { data: updated, error: updateError } = await withAttentionEmbeds(
      supabase
        .from('conversations')
        .update({
          status: input.status,
          status_version: input.statusVersion + 1,
          updated_at: new Date().toISOString()
        })
        .eq('tenant_id', tenantId)
        .eq('id', conversationId)
        .eq('status_version', input.statusVersion)
        .select(conversationSummarySelection),
      identity.userId
    ).maybeSingle();

    if (updateError) {
      throw new InternalServerErrorException(
        'No fue posible actualizar el estado de la conversación.'
      );
    }
    if (updated) {
      return updateConversationStatusResponseSchema.parse({
        item: asConversationSummary(updated as PersistedConversation)
      });
    }

    const { data: current, error: currentError } = await withAttentionEmbeds(
      supabase
        .from('conversations')
        .select(conversationSummarySelection)
        .eq('tenant_id', tenantId)
        .eq('id', conversationId),
      identity.userId
    ).maybeSingle();
    if (currentError) {
      throw new InternalServerErrorException(
        'No fue posible comprobar el estado de la conversación.'
      );
    }
    if (!current) {
      throw new NotFoundException('La conversación no existe en este tenant.');
    }
    const summary = asConversationSummary(current as PersistedConversation);
    if (summary.status === input.status) {
      return updateConversationStatusResponseSchema.parse({ item: summary });
    }
    throw new ConflictException(
      'La conversación cambió. Actualiza la bandeja antes de intentarlo de nuevo.'
    );
  }

  async changeAssignment(
    authorization: unknown,
    tenantId: string,
    conversationId: string,
    input: UpdateConversationAssignment
  ): Promise<UpdateConversationAssignmentResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertRole(identity.userId, tenantId, ['admin', 'supervisor']);
    if (
      input.assignedUserId &&
      !(await this.tenantAccessService.memberExists(input.assignedUserId, tenantId))
    ) {
      throw new NotFoundException('El integrante no existe en este tenant.');
    }

    const supabase = this.supabaseServerClientFactory.create();
    const { data: updated, error: updateError } = await withAttentionEmbeds(
      supabase
        .from('conversations')
        .update({
          assigned_user_id: input.assignedUserId,
          assignment_version: input.assignmentVersion + 1,
          updated_at: new Date().toISOString()
        })
        .eq('tenant_id', tenantId)
        .eq('id', conversationId)
        .eq('assignment_version', input.assignmentVersion)
        .select(conversationSummarySelection),
      identity.userId
    ).maybeSingle();
    if (updateError) {
      throw new InternalServerErrorException(
        'No fue posible actualizar la asignación de la conversación.'
      );
    }
    if (updated) {
      return updateConversationAssignmentResponseSchema.parse({
        item: asConversationSummary(updated as PersistedConversation)
      });
    }

    const { data: current, error: currentError } = await withAttentionEmbeds(
      supabase
        .from('conversations')
        .select(conversationSummarySelection)
        .eq('tenant_id', tenantId)
        .eq('id', conversationId),
      identity.userId
    ).maybeSingle();
    if (currentError) {
      throw new InternalServerErrorException(
        'No fue posible comprobar la asignación de la conversación.'
      );
    }
    if (!current) {
      throw new NotFoundException('La conversación no existe en este tenant.');
    }
    const summary = asConversationSummary(current as PersistedConversation);
    if (summary.assignedUserId === input.assignedUserId) {
      return updateConversationAssignmentResponseSchema.parse({ item: summary });
    }
    throw new ConflictException(
      'La asignación cambió. Actualiza la bandeja antes de intentarlo de nuevo.'
    );
  }

  async changeAutomation(
    authorization: unknown,
    tenantId: string,
    conversationId: string,
    input: UpdateConversationAutomation
  ): Promise<UpdateConversationAutomationResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);

    const supabase = this.supabaseServerClientFactory.create();
    const { data: updated, error: updateError } = await withAttentionEmbeds(
      supabase
        .from('conversations')
        .update({
          automation_mode: input.automationMode,
          automation_version: input.automationVersion + 1,
          updated_at: new Date().toISOString()
        })
        .eq('tenant_id', tenantId)
        .eq('id', conversationId)
        .eq('automation_version', input.automationVersion)
        .select(conversationSummarySelection),
      identity.userId
    ).maybeSingle();

    if (updateError) {
      throw new InternalServerErrorException(
        'No fue posible actualizar el bot de la conversacion.'
      );
    }
    if (updated) {
      return updateConversationAutomationResponseSchema.parse({
        item: asConversationSummary(updated as PersistedConversation)
      });
    }

    const { data: current, error: currentError } = await supabase
      .from('conversations')
      .select(conversationSummarySelection)
      .eq('tenant_id', tenantId)
      .eq('id', conversationId)
      .maybeSingle();
    if (currentError) {
      throw new InternalServerErrorException('No fue posible comprobar el bot de la conversacion.');
    }
    if (!current) {
      throw new NotFoundException('La conversacion no existe en este tenant.');
    }

    const summary = asConversationSummary(current as PersistedConversation);
    if (summary.automationMode === input.automationMode) {
      return updateConversationAutomationResponseSchema.parse({ item: summary });
    }
    throw new ConflictException(
      'El bot cambió. Actualiza la bandeja antes de intentarlo de nuevo.'
    );
  }
}
