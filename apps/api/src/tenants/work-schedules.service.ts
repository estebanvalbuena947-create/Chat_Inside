import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from '@nestjs/common';
import {
  workScheduleListSchema,
  workScheduleSchema,
  type SaveWorkSchedule,
  type WorkSchedule
} from '@chat-zernio/contracts';
import { validWeeklyShifts } from '@chat-zernio/domain';
import { RequestAuthenticator } from '../auth/request-authenticator';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantAccessService } from './tenant-access.service';

export function readWorkSchedule(row: Record<string, unknown>): WorkSchedule {
  return workScheduleSchema.parse({
    id: row.id,
    userId: row.user_id,
    effectiveAt: row.effective_at,
    shifts: row.shifts
  });
}

/** Paginate history: PostgREST's default page must never silently remove older versions. */
export async function loadWorkSchedules(
  client: SupabaseClient,
  tenantId: string,
  until?: string
): Promise<WorkSchedule[]> {
  const items: WorkSchedule[] = [];
  for (let start = 0; start <= 20000; start += 1000) {
    let query = client.from('advisor_work_schedules').select('*').eq('tenant_id', tenantId);
    if (until) query = query.lt('effective_at', until);
    const { data, error } = await query
      .order('effective_at', { ascending: false })
      .order('id', { ascending: false })
      .range(start, start + 999);
    if (error)
      throw new InternalServerErrorException(
        'No fue posible leer los horarios. Comprueba la migración de horarios.'
      );
    items.push(...(data ?? []).map(readWorkSchedule));
    if (items.length > 20000)
      throw new InternalServerErrorException(
        'El historial de horarios supera el límite de lectura.'
      );
    if ((data ?? []).length < 1000) return items;
  }
  throw new InternalServerErrorException('No fue posible completar el historial de horarios.');
}

@Injectable()
export class WorkSchedulesService {
  constructor(
    @Inject(RequestAuthenticator) private readonly auth: RequestAuthenticator,
    @Inject(TenantAccessService) private readonly access: TenantAccessService,
    @Inject(SupabaseServerClientFactory) private readonly factory: SupabaseServerClientFactory
  ) {}

  async list(authorization: unknown, tenantId: string) {
    const identity = await this.auth.authenticate(authorization);
    await this.access.assertMembership(identity.userId, tenantId);
    const items = await loadWorkSchedules(this.factory.create(), tenantId);
    const current = new Map<string, WorkSchedule>();
    for (const item of items) {
      if (!current.has(item.userId)) current.set(item.userId, item);
    }
    return workScheduleListSchema.parse({
      items: [...current.values()],
      timeZone: 'America/Mexico_City'
    });
  }

  async save(authorization: unknown, tenantId: string, userId: string, input: SaveWorkSchedule) {
    const identity = await this.auth.authenticate(authorization);
    await this.access.assertRole(identity.userId, tenantId, ['admin']);
    if (!(await this.access.memberExists(userId, tenantId)))
      throw new NotFoundException('El integrante ya no pertenece al equipo.');
    if (!validWeeklyShifts(input.shifts))
      throw new BadRequestException('Los turnos no pueden superponerse ni tener extremos iguales.');
    const { data, error } = await this.factory.create().rpc('save_advisor_work_schedule', {
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_actor_id: identity.userId,
      p_expected_id: input.expectedId,
      p_shifts: input.shifts
    });
    if (error?.code === '40001')
      throw new ConflictException('El horario cambió. Recarga antes de guardar.');
    if (error) throw new InternalServerErrorException('No fue posible guardar el horario.');
    return { item: readWorkSchedule(Array.isArray(data) ? data[0] : data) };
  }
}
