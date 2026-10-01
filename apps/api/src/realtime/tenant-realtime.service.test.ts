import { describe, expect, it, vi } from 'vitest';
import { TenantRealtimeService, opaqueCursor } from './tenant-realtime.service';

function query(result: unknown) {
  return {
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(result),
    order: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis()
  };
}

function createService(options?: { processedAt?: string }) {
  const client = {
    from: vi.fn((table: string) =>
      query({
        data:
          table === 'webhook_events'
            ? {
                failed_at: null,
                processed_at: options?.processedAt ?? '2026-08-14T12:00:02Z',
                received_at: '2026-08-14T12:00:00Z'
              }
            : table === 'outbox_events'
              ? { created_at: '2026-08-14T12:00:01Z', processed_at: '2026-08-14T12:00:03Z' }
              : { created_at: '2026-08-14T12:00:04Z' },
        error: null
      })
    )
  };
  const authenticate = vi.fn().mockResolvedValue({ userId: 'user-1' });
  const assertMembership = vi.fn().mockResolvedValue(undefined);
  return {
    assertMembership,
    authenticate,
    client,
    service: new TenantRealtimeService(
      { authenticate } as never,
      { assertMembership } as never,
      { create: () => client } as never
    )
  };
}

describe('TenantRealtimeService', () => {
  it('authorizes membership before opening a tenant stream', async () => {
    const { service, authenticate, assertMembership } = createService();

    await service.authorize('Bearer valid.jwt', 'tenant-1');

    expect(authenticate).toHaveBeenCalledWith('Bearer valid.jwt');
    expect(assertMembership).toHaveBeenCalledWith('user-1', 'tenant-1');
  });

  it('creates an opaque cursor that changes when activity changes', async () => {
    const first = createService();
    const second = createService({ processedAt: '2026-08-14T12:00:05Z' });

    const firstCursor = await first.service.currentCursor('tenant-1');
    const secondCursor = await second.service.currentCursor('tenant-1');

    expect(firstCursor).not.toBe(secondCursor);
    expect(firstCursor).not.toContain('2026-08-14');
    expect(first.client.from).toHaveBeenCalledTimes(4);
  });

  it('produces the same cursor for the same activity snapshot', () => {
    expect(opaqueCursor({ messages: { created_at: 'value' } })).toBe(
      opaqueCursor({ messages: { created_at: 'value' } })
    );
  });
});
