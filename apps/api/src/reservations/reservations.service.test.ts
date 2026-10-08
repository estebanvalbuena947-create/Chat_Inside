import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@chat-zernio/config', () => ({
  createReservationsSupabaseClient: vi.fn(() => ({ rpc }))
}));

import { ReservationsService } from './reservations.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const key = '22222222-2222-4222-8222-222222222222';

function service(roleError?: Error) {
  return new ReservationsService(
    { authenticate: vi.fn().mockResolvedValue({ userId: 'user-1' }) } as never,
    {
      assertRole: vi
        .fn()
        .mockImplementation(() => (roleError ? Promise.reject(roleError) : Promise.resolve())),
      getOwnProfile: vi.fn().mockResolvedValue({ item: { email: 'admin@example.com' } })
    } as never
  );
}

describe('ReservationsService.decide', () => {
  beforeEach(() => rpc.mockReset());

  it('authorizes the Inbox actor and delegates one atomic, idempotent command to SPA', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        action: 'approved',
        decided_by_email: 'admin@example.com',
        duplicate: false,
        previous_status: 'revision',
        resulting_status: 'confirmado'
      },
      error: null
    });
    await expect(
      service().decide('Bearer token', tenantId, 7, {
        action: 'approved',
        idempotencyKey: key,
        note: 'Pago validado'
      })
    ).resolves.toMatchObject({ item: { reservationDraftId: 7, duplicate: false } });
    expect(rpc).toHaveBeenCalledWith(
      'process_chat_reservation_decision',
      expect.objectContaining({
        p_actor_email: 'admin@example.com',
        p_idempotency_key: key,
        p_reservation_draft_id: 7
      })
    );
  });

  it('does not call SPA when the Inbox role is not allowed', async () => {
    await expect(
      service(new ForbiddenException()).decide('Bearer token', tenantId, 7, {
        action: 'rejected',
        idempotencyKey: key,
        note: null
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not report success when the external atomic command fails', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await expect(
      service().decide('Bearer token', tenantId, 7, {
        action: 'needs_info',
        idempotencyKey: key,
        note: null
      })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
