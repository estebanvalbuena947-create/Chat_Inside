import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from '@nestjs/common';
import {
  internalLabelListResponseSchema,
  internalLabelMutationResponseSchema,
  internalLabelSchema,
  type CreateInternalLabel,
  type DeleteInternalLabel,
  type InternalLabel,
  type InternalLabelListResponse,
  type InternalLabelMutationResponse,
  type UpdateInternalLabel
} from '@chat-zernio/contracts';
import { pickLabelColor } from '@chat-zernio/domain';
import { RequestAuthenticator } from '../auth/request-authenticator';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantAccessService } from '../tenants/tenant-access.service';

type PersistedLabel = {
  color: unknown;
  id: unknown;
  idempotency_key: unknown;
  name: unknown;
  updated_at: unknown;
  version: unknown;
};

type PersistedConversationLabel = {
  label: unknown;
};

function normalizeTimestamp(value: unknown): string {
  if (typeof value !== 'string') {
    throw new InternalServerErrorException('La etiqueta no tiene una fecha válida.');
  }
  const timestamp = new Date(value.replace(/([+-]\d{2})$/, '$1:00'));
  if (Number.isNaN(timestamp.getTime())) {
    throw new InternalServerErrorException('La etiqueta no tiene una fecha válida.');
  }
  return timestamp.toISOString();
}

function asInternalLabel(label: PersistedLabel): InternalLabel {
  return internalLabelSchema.parse({
    color: label.color,
    id: label.id,
    name: label.name,
    updatedAt: normalizeTimestamp(label.updated_at),
    version: label.version
  });
}

function readRelation(value: unknown): PersistedLabel {
  const relation = Array.isArray(value) ? value[0] : value;
  if (!relation || typeof relation !== 'object') {
    throw new InternalServerErrorException('La aplicación de etiqueta no es válida.');
  }
  return relation as PersistedLabel;
}

@Injectable()
export class InternalLabelService {
  constructor(
    @Inject(RequestAuthenticator) private readonly requestAuthenticator: RequestAuthenticator,
    @Inject(TenantAccessService) private readonly tenantAccessService: TenantAccessService,
    @Inject(SupabaseServerClientFactory)
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  async list(authorization: unknown, tenantId: string): Promise<InternalLabelListResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);
    const { data, error } = await this.supabaseServerClientFactory
      .create()
      .from('labels')
      .select('id, name, version, updated_at, color')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false });
    if (error) throw new InternalServerErrorException('No fue posible cargar las etiquetas.');
    return internalLabelListResponseSchema.parse({
      items: (data ?? []).map((label) => asInternalLabel(label as PersistedLabel))
    });
  }

  /**
   * El color se elige al crear la etiqueta, evitando repetir uno que el tenant ya use mientras
   * queden colores libres. Vive aqui y no en la interfaz: la regla es del dominio.
   */
  private async chooseColor(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    seed: string
  ): Promise<string> {
    const { data, error } = await supabase.from('labels').select('color').eq('tenant_id', tenantId);
    if (error) throw new InternalServerErrorException('No fue posible preparar la etiqueta.');
    const existing = (data ?? []).flatMap((row) =>
      typeof row.color === 'string' ? [row.color] : []
    );
    return pickLabelColor({ existing, seed });
  }
  async create(
    authorization: unknown,
    tenantId: string,
    command: CreateInternalLabel
  ): Promise<InternalLabelMutationResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertRole(identity.userId, tenantId, ['admin', 'supervisor']);
    const supabase = this.supabaseServerClientFactory.create();
    const existing = await this.findByIdempotencyKey(supabase, tenantId, command.idempotencyKey);
    if (existing) return this.assertSameCreation(existing, command);

    const color = await this.chooseColor(supabase, tenantId, command.name);
    const { data, error } = await supabase
      .from('labels')
      .insert({
        color,
        idempotency_key: command.idempotencyKey,
        name: command.name,
        tenant_id: tenantId
      })
      .select('id, idempotency_key, name, version, updated_at, color')
      .maybeSingle();
    if (!error && data) {
      return internalLabelMutationResponseSchema.parse({
        item: asInternalLabel(data as PersistedLabel)
      });
    }
    if (error?.code === '23505') {
      const raced = await this.findByIdempotencyKey(supabase, tenantId, command.idempotencyKey);
      if (raced) return this.assertSameCreation(raced, command);
      throw new ConflictException('Ya existe una etiqueta con ese nombre en este tenant.');
    }
    throw new InternalServerErrorException('No fue posible crear la etiqueta.');
  }

  async update(
    authorization: unknown,
    tenantId: string,
    labelId: string,
    command: UpdateInternalLabel
  ): Promise<InternalLabelMutationResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertRole(identity.userId, tenantId, ['admin', 'supervisor']);
    const supabase = this.supabaseServerClientFactory.create();
    const { data, error } = await supabase
      .from('labels')
      .update({
        name: command.name,
        updated_at: new Date().toISOString(),
        version: command.version + 1
      })
      .eq('tenant_id', tenantId)
      .eq('id', labelId)
      .eq('version', command.version)
      .select('id, idempotency_key, name, version, updated_at, color')
      .maybeSingle();
    if (error?.code === '23505') {
      throw new ConflictException('Ya existe una etiqueta con ese nombre en este tenant.');
    }
    if (error) throw new InternalServerErrorException('No fue posible actualizar la etiqueta.');
    if (data) {
      return internalLabelMutationResponseSchema.parse({
        item: asInternalLabel(data as PersistedLabel)
      });
    }
    const current = await this.findById(supabase, tenantId, labelId);
    if (!current) throw new NotFoundException('La etiqueta no existe en este tenant.');
    if (current.name === command.name) {
      return internalLabelMutationResponseSchema.parse({ item: asInternalLabel(current) });
    }
    throw new ConflictException(
      'La etiqueta cambió. Actualiza la bandeja antes de intentarlo de nuevo.'
    );
  }

  async remove(
    authorization: unknown,
    tenantId: string,
    labelId: string,
    command: DeleteInternalLabel
  ): Promise<InternalLabelMutationResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertRole(identity.userId, tenantId, ['admin', 'supervisor']);
    const supabase = this.supabaseServerClientFactory.create();
    const { data, error } = await supabase
      .from('labels')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', labelId)
      .eq('version', command.version)
      .select('id, idempotency_key, name, version, updated_at, color')
      .maybeSingle();
    if (error) throw new InternalServerErrorException('No fue posible eliminar la etiqueta.');
    if (data) {
      return internalLabelMutationResponseSchema.parse({
        item: asInternalLabel(data as PersistedLabel)
      });
    }
    const current = await this.findById(supabase, tenantId, labelId);
    if (!current) throw new NotFoundException('La etiqueta no existe en este tenant.');
    throw new ConflictException(
      'La etiqueta cambió. Actualiza la bandeja antes de intentarlo de nuevo.'
    );
  }

  async listForConversation(
    authorization: unknown,
    tenantId: string,
    conversationId: string
  ): Promise<InternalLabelListResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);
    const supabase = this.supabaseServerClientFactory.create();
    await this.assertConversation(supabase, tenantId, conversationId);
    return this.listForConversationFromDatabase(supabase, tenantId, conversationId);
  }

  async assign(
    authorization: unknown,
    tenantId: string,
    conversationId: string,
    labelId: string
  ): Promise<InternalLabelListResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);
    const supabase = this.supabaseServerClientFactory.create();
    await this.assertConversationAndLabel(supabase, tenantId, conversationId, labelId);
    const { error } = await supabase
      .from('conversation_labels')
      .upsert(
        { conversation_id: conversationId, label_id: labelId, tenant_id: tenantId },
        { ignoreDuplicates: true, onConflict: 'tenant_id,conversation_id,label_id' }
      );
    if (error) throw new InternalServerErrorException('No fue posible aplicar la etiqueta.');
    return this.listForConversationFromDatabase(supabase, tenantId, conversationId);
  }

  async unassign(
    authorization: unknown,
    tenantId: string,
    conversationId: string,
    labelId: string
  ): Promise<InternalLabelListResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);
    const supabase = this.supabaseServerClientFactory.create();
    await this.assertConversationAndLabel(supabase, tenantId, conversationId, labelId);
    const { error } = await supabase
      .from('conversation_labels')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversationId)
      .eq('label_id', labelId);
    if (error) throw new InternalServerErrorException('No fue posible retirar la etiqueta.');
    return this.listForConversationFromDatabase(supabase, tenantId, conversationId);
  }

  private async listForConversationFromDatabase(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    conversationId: string
  ): Promise<InternalLabelListResponse> {
    const { data, error } = await supabase
      .from('conversation_labels')
      .select('label:labels(id, name, version, updated_at, color)')
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error)
      throw new InternalServerErrorException('No fue posible cargar las etiquetas aplicadas.');
    return internalLabelListResponseSchema.parse({
      items: (data ?? []).map((item) =>
        asInternalLabel(readRelation((item as PersistedConversationLabel).label))
      )
    });
  }

  private async assertConversationAndLabel(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    conversationId: string,
    labelId: string
  ): Promise<void> {
    await this.assertConversation(supabase, tenantId, conversationId);
    const label = await this.findById(supabase, tenantId, labelId);
    if (!label) throw new NotFoundException('La etiqueta no existe en este tenant.');
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
    if (error) throw new InternalServerErrorException('No fue posible comprobar la conversación.');
    if (!data) throw new NotFoundException('La conversación no existe en este tenant.');
  }

  private async findById(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    labelId: string
  ): Promise<PersistedLabel | null> {
    const { data, error } = await supabase
      .from('labels')
      .select('id, idempotency_key, name, version, updated_at, color')
      .eq('tenant_id', tenantId)
      .eq('id', labelId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('No fue posible comprobar la etiqueta.');
    return (data as PersistedLabel | null) ?? null;
  }

  private async findByIdempotencyKey(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    idempotencyKey: string
  ): Promise<PersistedLabel | null> {
    const { data, error } = await supabase
      .from('labels')
      .select('id, idempotency_key, name, version, updated_at, color')
      .eq('tenant_id', tenantId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('No fue posible comprobar la solicitud.');
    return (data as PersistedLabel | null) ?? null;
  }

  private assertSameCreation(
    existing: PersistedLabel,
    command: CreateInternalLabel
  ): InternalLabelMutationResponse {
    if (existing.name !== command.name) {
      throw new ConflictException('La clave de idempotencia ya corresponde a otra etiqueta.');
    }
    return internalLabelMutationResponseSchema.parse({ item: asInternalLabel(existing) });
  }
}
