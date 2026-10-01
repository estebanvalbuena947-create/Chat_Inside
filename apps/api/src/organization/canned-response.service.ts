import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from '@nestjs/common';
import {
  cannedResponseListResponseSchema,
  cannedResponseMutationResponseSchema,
  cannedResponseSchema,
  type CannedResponse,
  type CannedResponseListResponse,
  type CannedResponseMutationResponse,
  type CreateCannedResponse,
  type DeleteCannedResponse,
  type TenantRole,
  type UpdateCannedResponse
} from '@chat-zernio/contracts';
import { RequestAuthenticator } from '../auth/request-authenticator';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantAccessService } from '../tenants/tenant-access.service';

type PersistedCannedResponse = {
  body: unknown;
  created_by_user_id?: unknown;
  id: unknown;
  idempotency_key: unknown;
  title: unknown;
  updated_at: unknown;
  version: unknown;
};

function normalizeTimestamp(value: unknown): string {
  if (typeof value !== 'string') {
    throw new InternalServerErrorException('La respuesta rápida no tiene una fecha válida.');
  }
  const timestamp = new Date(value.replace(/([+-]\d{2})$/, '$1:00'));
  if (Number.isNaN(timestamp.getTime())) {
    throw new InternalServerErrorException('La respuesta rápida no tiene una fecha válida.');
  }
  return timestamp.toISOString();
}

function asCannedResponse(response: PersistedCannedResponse, canManage: boolean): CannedResponse {
  return cannedResponseSchema.parse({
    body: response.body,
    canManage,
    id: response.id,
    title: response.title,
    updatedAt: normalizeTimestamp(response.updated_at),
    version: response.version
  });
}

/**
 * La biblioteca es compartida: un agente mantiene las respuestas que él creó y solo un
 * supervisor o administrador puede tocar las de los demás, para que nadie reescriba en
 * caliente el texto que otra persona está usando.
 */
function canManageCannedResponse(
  role: TenantRole,
  authorUserId: unknown,
  requesterUserId: string
): boolean {
  if (role === 'admin' || role === 'supervisor') return true;
  return typeof authorUserId === 'string' && authorUserId === requesterUserId;
}

@Injectable()
export class CannedResponseService {
  constructor(
    @Inject(RequestAuthenticator) private readonly requestAuthenticator: RequestAuthenticator,
    @Inject(TenantAccessService) private readonly tenantAccessService: TenantAccessService,
    @Inject(SupabaseServerClientFactory)
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  async list(authorization: unknown, tenantId: string): Promise<CannedResponseListResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);
    const role = await this.tenantAccessService.resolveRole(identity.userId, tenantId);
    const { data, error } = await this.supabaseServerClientFactory
      .create()
      .from('canned_responses')
      .select('id, title, body, version, updated_at, created_by_user_id')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException('No fue posible cargar las respuestas rápidas.');
    }

    return cannedResponseListResponseSchema.parse({
      items: (data ?? []).map((response) => {
        const persisted = response as PersistedCannedResponse;
        return asCannedResponse(
          persisted,
          canManageCannedResponse(role, persisted.created_by_user_id, identity.userId)
        );
      })
    });
  }

  async create(
    authorization: unknown,
    tenantId: string,
    command: CreateCannedResponse
  ): Promise<CannedResponseMutationResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);
    const supabase = this.supabaseServerClientFactory.create();
    const existing = await this.findByIdempotencyKey(supabase, tenantId, command.idempotencyKey);
    if (existing) return this.resolveIdempotentCreate(existing, command);

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('canned_responses')
      .insert({
        body: command.body,
        created_by_user_id: identity.userId,
        idempotency_key: command.idempotencyKey,
        tenant_id: tenantId,
        title: command.title,
        updated_at: now
      })
      .select('id, title, body, version, updated_at, idempotency_key, created_by_user_id')
      .maybeSingle();

    if (!error && data) {
      return cannedResponseMutationResponseSchema.parse({
        item: asCannedResponse(data as PersistedCannedResponse, true)
      });
    }
    if (error?.code === '23505') {
      const raced = await this.findByIdempotencyKey(supabase, tenantId, command.idempotencyKey);
      if (raced) return this.resolveIdempotentCreate(raced, command);
    }
    throw new InternalServerErrorException('No fue posible guardar la respuesta rápida.');
  }

  async update(
    authorization: unknown,
    tenantId: string,
    responseId: string,
    command: UpdateCannedResponse
  ): Promise<CannedResponseMutationResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);
    const role = await this.tenantAccessService.resolveRole(identity.userId, tenantId);
    const supabase = this.supabaseServerClientFactory.create();

    const current = await this.findById(supabase, tenantId, responseId);
    if (!current) throw new NotFoundException('La respuesta rápida no existe en este tenant.');
    if (!canManageCannedResponse(role, current.created_by_user_id, identity.userId)) {
      throw new ForbiddenException('Solo puedes editar las respuestas rápidas que creaste.');
    }

    const { data, error } = await supabase
      .from('canned_responses')
      .update({
        body: command.body,
        title: command.title,
        updated_at: new Date().toISOString(),
        version: command.version + 1
      })
      .eq('tenant_id', tenantId)
      .eq('id', responseId)
      .eq('version', command.version)
      .select('id, title, body, version, updated_at, idempotency_key, created_by_user_id')
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException('No fue posible actualizar la respuesta rápida.');
    }
    if (data) {
      return cannedResponseMutationResponseSchema.parse({
        item: asCannedResponse(data as PersistedCannedResponse, true)
      });
    }

    const refreshed = await this.findById(supabase, tenantId, responseId);
    if (!refreshed) throw new NotFoundException('La respuesta rápida no existe en este tenant.');
    if (refreshed.title === command.title && refreshed.body === command.body) {
      return cannedResponseMutationResponseSchema.parse({
        item: asCannedResponse(refreshed, true)
      });
    }
    throw new ConflictException(
      'La respuesta rápida cambió. Actualiza la lista antes de intentarlo de nuevo.'
    );
  }

  async remove(
    authorization: unknown,
    tenantId: string,
    responseId: string,
    command: DeleteCannedResponse
  ): Promise<CannedResponseMutationResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);
    const role = await this.tenantAccessService.resolveRole(identity.userId, tenantId);
    const supabase = this.supabaseServerClientFactory.create();

    const current = await this.findById(supabase, tenantId, responseId);
    if (!current) throw new NotFoundException('La respuesta rápida no existe en este tenant.');
    if (!canManageCannedResponse(role, current.created_by_user_id, identity.userId)) {
      throw new ForbiddenException('Solo puedes eliminar las respuestas rápidas que creaste.');
    }

    const { data, error } = await supabase
      .from('canned_responses')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', responseId)
      .eq('version', command.version)
      .select('id, title, body, version, updated_at, idempotency_key, created_by_user_id')
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException('No fue posible eliminar la respuesta rápida.');
    }
    if (data) {
      return cannedResponseMutationResponseSchema.parse({
        item: asCannedResponse(data as PersistedCannedResponse, true)
      });
    }
    const refreshed = await this.findById(supabase, tenantId, responseId);
    if (!refreshed) throw new NotFoundException('La respuesta rápida no existe en este tenant.');
    throw new ConflictException(
      'La respuesta rápida cambió. Actualiza la lista antes de intentarlo de nuevo.'
    );
  }

  private async findByIdempotencyKey(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    idempotencyKey: string
  ): Promise<PersistedCannedResponse | null> {
    const { data, error } = await supabase
      .from('canned_responses')
      .select('id, title, body, version, updated_at, idempotency_key, created_by_user_id')
      .eq('tenant_id', tenantId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException('No fue posible comprobar la idempotencia.');
    }
    return (data as PersistedCannedResponse | null) ?? null;
  }

  private async findById(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    responseId: string
  ): Promise<PersistedCannedResponse | null> {
    const { data, error } = await supabase
      .from('canned_responses')
      .select('id, title, body, version, updated_at, idempotency_key, created_by_user_id')
      .eq('tenant_id', tenantId)
      .eq('id', responseId)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException('No fue posible comprobar la respuesta rápida.');
    }
    return (data as PersistedCannedResponse | null) ?? null;
  }

  private resolveIdempotentCreate(
    existing: PersistedCannedResponse,
    command: CreateCannedResponse
  ): CannedResponseMutationResponse {
    if (existing.title !== command.title || existing.body !== command.body) {
      throw new ConflictException(
        'La clave de idempotencia ya fue usada para otra respuesta rápida.'
      );
    }
    return cannedResponseMutationResponseSchema.parse({
      item: asCannedResponse(existing, true)
    });
  }
}
