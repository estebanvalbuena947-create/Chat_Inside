import { describe, expect, it, vi } from 'vitest';
import { ConversationNoteService } from './conversation-note.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const conversationId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const idempotencyKey = '44444444-4444-4444-8444-444444444444';
const persistedNote = {
  body: 'Prefiere horarios en la tarde.',
  conversation_id: conversationId,
  created_at: '2026-08-14T00:00:00+00',
  created_by_user_id: userId,
  id: '55555555-5555-4555-8555-555555555555',
  idempotency_key: idempotencyKey
};

function conversationQuery() {
  return {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: { id: conversationId }, error: null }),
    select: vi.fn().mockReturnThis()
  };
}

describe('ConversationNoteService', () => {
  it('does not query private notes when tenant membership is rejected', async () => {
    const from = vi.fn();
    const service = new ConversationNoteService(
      { authenticate: async () => ({ userId }) } as never,
      { assertMembership: async () => Promise.reject(new Error('forbidden')) } as never,
      { create: () => ({ from }) } as never
    );

    await expect(service.list('Bearer valid.jwt', tenantId, conversationId)).rejects.toThrow(
      'forbidden'
    );
    expect(from).not.toHaveBeenCalled();
  });

  it('creates a tenant-scoped note only after proving the conversation belongs to the tenant', async () => {
    const conversation = conversationQuery();
    const existing = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      select: vi.fn().mockReturnThis()
    };
    const inserted = {
      insert: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: persistedNote, error: null }),
      select: vi.fn().mockReturnThis()
    };
    const from = vi
      .fn()
      .mockReturnValueOnce(conversation)
      .mockReturnValueOnce(existing)
      .mockReturnValueOnce(inserted);
    const assertMembership = vi.fn().mockResolvedValue(undefined);
    const service = new ConversationNoteService(
      { authenticate: async () => ({ userId }) } as never,
      { assertMembership } as never,
      { create: () => ({ from }) } as never
    );

    await expect(
      service.create('Bearer valid.jwt', tenantId, conversationId, {
        body: persistedNote.body,
        idempotencyKey
      })
    ).resolves.toMatchObject({ item: { body: persistedNote.body, id: persistedNote.id } });
    expect(assertMembership).toHaveBeenCalledWith(userId, tenantId);
    expect(from).toHaveBeenNthCalledWith(1, 'conversations');
    expect(conversation.eq).toHaveBeenCalledWith('tenant_id', tenantId);
    expect(from).toHaveBeenNthCalledWith(3, 'conversation_notes');
    expect(inserted.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: conversationId,
        created_by_user_id: userId,
        idempotency_key: idempotencyKey,
        tenant_id: tenantId
      })
    );
  });

  it('returns the original note when the same create command is retried', async () => {
    const conversation = conversationQuery();
    const existing = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: persistedNote, error: null }),
      select: vi.fn().mockReturnThis()
    };
    const from = vi.fn().mockReturnValueOnce(conversation).mockReturnValueOnce(existing);
    const service = new ConversationNoteService(
      { authenticate: async () => ({ userId }) } as never,
      { assertMembership: async () => undefined } as never,
      { create: () => ({ from }) } as never
    );

    await expect(
      service.create('Bearer valid.jwt', tenantId, conversationId, {
        body: persistedNote.body,
        idempotencyKey
      })
    ).resolves.toMatchObject({ item: { id: persistedNote.id } });
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('does not read notes when the conversation is absent from the tenant', async () => {
    const conversation = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      select: vi.fn().mockReturnThis()
    };
    const from = vi.fn().mockReturnValue(conversation);
    const service = new ConversationNoteService(
      { authenticate: async () => ({ userId }) } as never,
      { assertMembership: async () => undefined } as never,
      { create: () => ({ from }) } as never
    );

    await expect(service.list('Bearer valid.jwt', tenantId, conversationId)).rejects.toThrow(
      'La conversacion no existe'
    );
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith('conversations');
  });

  it('rejects an idempotency key reused with another note body', async () => {
    const conversation = conversationQuery();
    const existing = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: persistedNote, error: null }),
      select: vi.fn().mockReturnThis()
    };
    const from = vi.fn().mockReturnValueOnce(conversation).mockReturnValueOnce(existing);
    const service = new ConversationNoteService(
      { authenticate: async () => ({ userId }) } as never,
      { assertMembership: async () => undefined } as never,
      { create: () => ({ from }) } as never
    );

    await expect(
      service.create('Bearer valid.jwt', tenantId, conversationId, {
        body: 'Una nota distinta.',
        idempotencyKey
      })
    ).rejects.toThrow('La clave de la nota ya fue usada');
  });
});
