import { describe, expect, it, vi } from 'vitest';
import { WorkSchedulesService } from './work-schedules.service';
import type { RequestAuthenticator } from '../auth/request-authenticator';
import type { TenantAccessService } from './tenant-access.service';
import type { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';

const id = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const actor = '33333333-3333-4333-8333-333333333333';
const shifts = [{ day: 1, start: 480, end: 1020 }];
const row = { id, user_id: user, effective_at: '2026-10-20T14:00:00Z', shifts };
function setup() {
  const auth = { authenticate: vi.fn().mockResolvedValue({ userId: actor }) };
  const access = {
    assertMembership: vi.fn().mockResolvedValue(undefined),
    assertRole: vi.fn().mockResolvedValue(undefined),
    memberExists: vi.fn().mockResolvedValue(true)
  };
  const rpc = vi.fn().mockResolvedValue({ data: row, error: null });
  const range = vi.fn().mockResolvedValue({ data: [row], error: null });
  const order = vi.fn().mockReturnValue({ range });
  order.mockReturnValue({ order, range });
  const eq = vi.fn().mockReturnValue({ order });
  const from = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) });
  const service = new WorkSchedulesService(
    auth as unknown as RequestAuthenticator,
    access as unknown as TenantAccessService,
    { create: () => ({ rpc, from }) } as unknown as SupabaseServerClientFactory
  );
  return { service, auth, access, rpc, from, eq, order, range };
}
describe('horarios autorizados por tenant', () => {
  it('guarda por identidad y tenant, con versión esperada y actor autenticado', async () => {
    const h = setup();
    expect(await h.service.save('session', id, user, { expectedId: null, shifts })).toEqual({
      item: { id, userId: user, effectiveAt: row.effective_at, shifts }
    });
    expect(h.access.assertRole).toHaveBeenCalledWith(actor, id, ['admin']);
    expect(h.rpc).toHaveBeenCalledWith('save_advisor_work_schedule', {
      p_tenant_id: id,
      p_user_id: user,
      p_actor_id: actor,
      p_expected_id: null,
      p_shifts: shifts
    });
  });
  it('no escribe sin permiso de administrador', async () => {
    const h = setup();
    h.access.assertRole.mockRejectedValue(new Error('prohibido'));
    await expect(h.service.save('session', id, user, { expectedId: null, shifts })).rejects.toThrow(
      'prohibido'
    );
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it('rechaza a un integrante de otro tenant antes de escribir', async () => {
    const h = setup();
    h.access.memberExists.mockResolvedValue(false);
    await expect(h.service.save('session', id, user, { expectedId: null, shifts })).rejects.toThrow(
      'no pertenece'
    );
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it('rechaza solapamientos sin consultar el RPC', async () => {
    const h = setup();
    await expect(
      h.service.save('session', id, user, { expectedId: null, shifts: [...shifts, ...shifts] })
    ).rejects.toThrow('superponerse');
    expect(h.rpc).not.toHaveBeenCalled();
  });
  it('informa un conflicto sin sobrescribir la versión ajena', async () => {
    const h = setup();
    h.rpc.mockResolvedValue({ data: null, error: { code: '40001' } });
    await expect(h.service.save('session', id, user, { expectedId: id, shifts })).rejects.toThrow(
      'Recarga'
    );
    expect(h.rpc).toHaveBeenCalledTimes(1);
  });
  it('no disfraza una falla de almacenamiento como guardado', async () => {
    const h = setup();
    h.rpc.mockResolvedValue({ data: null, error: { code: 'XX000' } });
    await expect(h.service.save('session', id, user, { expectedId: null, shifts })).rejects.toThrow(
      'No fue posible guardar'
    );
  });
  it('lee solo el tenant autorizado y presenta la última versión de cada integrante', async () => {
    const h = setup();
    h.range.mockResolvedValue({
      data: [row, { ...row, id: user, effective_at: '2026-10-19T14:00:00Z', shifts: [] }],
      error: null
    });
    expect((await h.service.list('session', id)).items).toHaveLength(1);
    expect(h.eq).toHaveBeenCalledWith('tenant_id', id);
  });
  it('no lee horarios si falla la membresía', async () => {
    const h = setup();
    h.access.assertMembership.mockRejectedValue(new Error('sin acceso'));
    await expect(h.service.list('session', id)).rejects.toThrow('sin acceso');
    expect(h.from).not.toHaveBeenCalled();
  });
});
