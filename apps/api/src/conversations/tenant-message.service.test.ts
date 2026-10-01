import { describe, expect, it, vi } from 'vitest';
import { TenantMessageService } from './tenant-message.service';

describe('TenantMessageService', () => {
  it('accepts the persisted received state used by inbound messages', async () => {
    const message = {
      body: 'Mensaje entrante',
      created_at: '2026-08-13T00:00:00+00',
      direction: 'inbound',
      id: '44444444-4444-4444-8444-444444444444',
      sender_type: 'contact',
      sent_at: null,
      source: 'dm',
      status: 'received'
    };
    const conversationQuery = {
      eq: () => conversationQuery,
      maybeSingle: async () => ({
        data: { id: '33333333-3333-4333-8333-333333333333' },
        error: null
      }),
      select: () => conversationQuery
    };
    const messagesQuery = {
      eq: () => messagesQuery,
      limit: async () => ({ data: [message], error: null }),
      order: () => messagesQuery,
      select: () => messagesQuery
    };
    const service = new TenantMessageService(
      { authenticate: async () => ({ userId: '22222222-2222-4222-8222-222222222222' }) } as never,
      { assertMembership: async () => undefined } as never,
      {
        create: () => ({
          from: (table: string) => (table === 'conversations' ? conversationQuery : messagesQuery)
        })
      } as never
    );

    await expect(
      service.list(
        'Bearer valid.jwt',
        '11111111-1111-4111-8111-111111111111',
        '33333333-3333-4333-8333-333333333333',
        { limit: 10 }
      )
    ).resolves.toMatchObject({ items: [{ status: 'received' }] });
  });

  it('does not query message history when tenant membership is rejected', async () => {
    const create = vi.fn();
    const service = new TenantMessageService(
      { authenticate: async () => ({ userId: '22222222-2222-4222-8222-222222222222' }) } as never,
      {
        assertMembership: async () => {
          throw new Error('forbidden');
        }
      } as never,
      { create: () => ({ from: create }) } as never
    );

    await expect(
      service.list(
        'Bearer valid.jwt',
        '11111111-1111-4111-8111-111111111111',
        '33333333-3333-4333-8333-333333333333',
        { limit: 10 }
      )
    ).rejects.toThrow('forbidden');
    expect(create).not.toHaveBeenCalled();
  });
});
