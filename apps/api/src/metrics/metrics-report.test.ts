import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  metricsSummaryQuerySchema,
  reservationBoardQuerySchema,
  responseDetailQuerySchema
} from '@chat-zernio/contracts';
import { MetricsService } from './metrics.service';
import type { RequestAuthenticator } from '../auth/request-authenticator';
import type { TenantAccessService } from '../tenants/tenant-access.service';
import type { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';

const tenant = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const now = '2026-10-20T16:00:00.000Z';
afterEach(() => vi.restoreAllMocks());
function setup() {
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse(now));
  const auth = { authenticate: vi.fn().mockResolvedValue({ userId: user }) };
  const access = { assertMembership: vi.fn().mockResolvedValue(undefined) };
  const calls: Array<{ table: string; method: string; args: unknown[] }> = [];
  const rows: Record<string, unknown>[] = [];
  for (let index = 0; index < 30; index++) {
    rows.push(
      {
        conversation_id: `c${index}`,
        created_at: '2026-10-20T13:59:00.000Z',
        direction: 'inbound',
        sender_type: 'contact',
        channel_account: { platform: 'whatsapp' }
      },
      {
        conversation_id: `c${index}`,
        created_at: '2026-10-20T14:06:00.000Z',
        direction: 'outbound',
        sender_type: 'agent',
        channel_account: { platform: 'whatsapp' }
      }
    );
  }
  rows.push({
    conversation_id: 'old',
    created_at: '2026-10-20T05:59:00.000Z',
    direction: 'inbound',
    sender_type: 'contact',
    channel_account: { platform: 'instagram' }
  });
  const from = vi.fn((table: string) => {
    let columns = '';
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'gte', 'lt', 'in', 'order'])
      query[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        if (method === 'select') columns = String(args[0]);
        if (method === 'gte')
          filters.push((row) => String(row[String(args[0])]) >= String(args[1]));
        if (method === 'lt') filters.push((row) => String(row[String(args[0])]) < String(args[1]));
        return query;
      };
    const result = () => {
      if (table === 'messages')
        return { data: rows.filter((row) => filters.every((filter) => filter(row))), error: null };
      if (table === 'advisor_work_schedules')
        return {
          data: [
            {
              id: tenant,
              user_id: user,
              effective_at: '2026-10-01T00:00:00Z',
              shifts: [{ day: 2, start: 480, end: 1020 }]
            }
          ],
          error: null
        };
      if (table === 'conversations' && columns.includes('contact:'))
        return {
          data: rows
            .filter((row) => row.direction === 'inbound')
            .map((row) => ({
              id: row.conversation_id,
              contact: { display_name: 'Contacto de prueba' }
            })),
          error: null
        };
      return { data: [], error: null };
    };
    query.range = async (start: number, end: number) => {
      const r = result();
      return { ...r, data: r.data.slice(start, end + 1) };
    };
    query.then = (resolve: (result: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return query;
  });
  const service = new MetricsService(
    auth as unknown as RequestAuthenticator,
    access as unknown as TenantAccessService,
    {
      create: () => ({
        from,
        rpc: (_name: string, args: { p_before: string }) => {
          const q = from('messages') as { lt: (field: string, value: string) => unknown };
          return q.lt('created_at', args.p_before);
        }
      })
    } as unknown as SupabaseServerClientFactory
  );
  return { service, calls, from, access };
}
describe('resumen y detalle operativo con la misma política', () => {
  it('Hoy empieza a medianoche de México, no hace 24 horas, y devuelve la fecha y reloj usados', async () => {
    const h = setup();
    const report = await h.service.summary('session', tenant, { days: 1 });
    expect(report.operationalDate).toBe('2026-10-20');
    expect(report.updatedAt).toBe(now);
    expect(report.totalMessages).toBe(60);
    expect(h.calls).toContainEqual({
      table: 'messages',
      method: 'gte',
      args: ['created_at', '2026-10-20T06:00:00.000Z']
    });
    expect(
      h.calls
        .filter((call) => call.method === 'eq' && call.args[0] === 'tenant_id')
        .every((call) => call.args[1] === tenant)
    ).toBe(true);
  });
  it('el contador y las páginas listan exactamente las mismas 30 respuestas dentro de horario', async () => {
    const h = setup();
    const summary = await h.service.summary('session', tenant, { days: 1 });
    const query = { days: 1, bucket: 'between' as const, page: 1, asOf: summary.updatedAt };
    const first = await h.service.responses('session', tenant, query);
    const second = await h.service.responses('session', tenant, { ...query, page: 2 });
    expect(first.total).toBe(summary.responseTime.betweenFiveAndTenMinutes);
    expect(first.items).toHaveLength(25);
    expect(second.items).toHaveLength(5);
    expect(new Set([...first.items, ...second.items].map((item) => item.conversationId)).size).toBe(
      30
    );
    expect(first.items[0]).toMatchObject({
      seconds: 360,
      elapsedSeconds: 420,
      basis: 'working',
      contactName: 'Contacto de prueba'
    });
    expect(summary.responseTime.workingConversations).toBe(30);
  });
  it('una fecha escrita usa el mismo día operativo que Hoy', async () => {
    const h = setup();
    expect(
      (await h.service.summary('session', tenant, { date: '2026-10-20', days: 30 })).totalMessages
    ).toBe(60);
  });
  it('no consulta datos si la sesión no pertenece al tenant', async () => {
    const h = setup();
    h.access.assertMembership.mockRejectedValue(new Error('sin acceso'));
    await expect(h.service.summary('session', tenant, { days: 1 })).rejects.toThrow('sin acceso');
    expect(h.from).not.toHaveBeenCalled();
  });
  it('rechaza días imposibles, rangos inválidos y páginas negativas en el límite', () => {
    expect(metricsSummaryQuerySchema.safeParse({ date: '2026-02-30' }).success).toBe(false);
    expect(reservationBoardQuerySchema.safeParse({ date: '2026-02-30' }).success).toBe(false);
    expect(responseDetailQuerySchema.safeParse({ bucket: 'other' }).success).toBe(false);
    expect(responseDetailQuerySchema.safeParse({ bucket: 'under', page: 0 }).success).toBe(false);
  });
});
