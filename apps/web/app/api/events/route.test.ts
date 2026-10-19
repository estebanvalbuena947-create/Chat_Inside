import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from './route';

vi.mock('../../../lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({ data: { claims: { sub: 'user' } }, error: null }),
      getSession: async () => ({ data: { session: { access_token: 'test-token' } } })
    }
  })
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('SSE BFF cancellation', () => {
  it('propagates the abort signal and cancels the upstream when its response is cancelled', async () => {
    vi.stubEnv('INTERNAL_API_URL', 'http://api.test');
    const cancel = vi.fn();
    const upstream = new ReadableStream<Uint8Array>({ cancel });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ items: [{ id: 'tenant' }] }))
      .mockResolvedValueOnce(new Response(upstream));
    vi.stubGlobal('fetch', fetcher);
    const abort = new AbortController();
    const request = new NextRequest('http://web.test/api/events', { signal: abort.signal });
    const response = await GET(request);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(fetcher.mock.calls[0][1].signal).toBe(request.signal);
    expect(fetcher.mock.calls[1][1].signal).toBe(request.signal);
    abort.abort();
    expect(fetcher.mock.calls[1][1].signal.aborted).toBe(true);
    await response.body?.cancel();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
