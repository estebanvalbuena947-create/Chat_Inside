import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('../../../../lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getClaims: async () => ({ data: { claims: { sub: 'fixture-user' } }, error: null }),
      getSession: async () => ({ data: { session: { access_token: 'fixture-access-token' } } })
    }
  }))
}));
import { GET } from './route';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('BFF de Reservas: fecha y alcance', () => {
  it.each([
    ['?date=2026-10-19&draftScope=all', '?date=2026-10-19&draftScope=all'],
    ['?date=2026-10-19', '?date=2026-10-19'],
    ['?draftScope=invalid', '']
  ])('reenvía solo el alcance autorizado %s', async (query, expected) => {
    vi.stubEnv('INTERNAL_API_URL', 'http://api.fixture');
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: [{ id: 'tenant-fixture' }] }))
      .mockResolvedValueOnce(
        Response.json({ draftScope: expected.includes('all') ? 'all' : 'day' })
      );
    vi.stubGlobal('fetch', fetcher);
    const response = await GET(new NextRequest(`http://localhost/api/reservations/board${query}`));
    expect(response.status).toBe(200);
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      `http://api.fixture/v1/tenants/tenant-fixture/reservations/board${expected}`
    );
  });
});
