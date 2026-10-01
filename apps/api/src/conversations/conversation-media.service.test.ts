import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { encodeMediaCursor } from '@chat-zernio/domain';
import { ConversationMediaService } from './conversation-media.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const contactId = '33333333-3333-4333-8333-333333333333';
const conversationId = '44444444-4444-4444-8444-444444444444';
const messageId = '55555555-5555-4555-8555-555555555555';

const attachmentRow = {
  content_type: 'image/jpeg',
  conversation: { contact: { display_name: 'Iván' }, contact_id: contactId },
  conversation_id: conversationId,
  created_at: '2026-09-29T03:57:56.761+00:00',
  id: '66666666-6666-4666-8666-666666666666',
  kind: 'image',
  message_id: messageId,
  storage_object_path: 'tenant/conversation/message/0.jpg'
};

function createService(options: {
  rows?: unknown[];
  signedError?: boolean;
  canAccess?: boolean;
  rowsWithoutCopy?: boolean;
}): { service: ConversationMediaService; storage: { createSignedUrls: ReturnType<typeof vi.fn> } } {
  const rows = options.rows ?? [attachmentRow];
  const builder: Record<string, unknown> = {};
  for (const method of ['eq', 'or', 'order', 'select']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.limit = vi.fn().mockResolvedValue({ data: rows, error: null });

  const createSignedUrls = vi.fn().mockResolvedValue({
    data: options.signedError
      ? null
      : rows.map((row) => ({
          path: (row as { storage_object_path: string }).storage_object_path,
          signedUrl: 'https://storage.example.test/firmado'
        })),
    error: options.signedError ? { message: 'no' } : null
  });

  const service = new ConversationMediaService(
    { authenticate: async () => ({ userId }) } as never,
    {
      assertMembership: async () => {
        if (options.canAccess === false) throw new Error('forbidden');
      }
    } as never,
    {
      create: () => ({ from: () => builder, storage: { from: () => ({ createSignedUrls }) } })
    } as never
  );

  return { service, storage: { createSignedUrls } };
}

describe('ConversationMediaService', () => {
  it('returns the media of the tenant with the contact name and a temporary link', async () => {
    const { service, storage } = createService({});

    await expect(service.list('Bearer valid.jwt', tenantId, {})).resolves.toEqual({
      items: [
        {
          contactId,
          contactName: 'Iván',
          contentType: 'image/jpeg',
          conversationId,
          createdAt: '2026-09-29T03:57:56.761Z',
          id: '66666666-6666-4666-8666-666666666666',
          kind: 'image',
          messageId,
          title: null,
          url: 'https://storage.example.test/firmado'
        }
      ],
      nextCursor: null
    });

    expect(storage.createSignedUrls).toHaveBeenCalledWith(
      ['tenant/conversation/message/0.jpg'],
      600
    );
  });

  it('lists a media file whose copy is missing, without breaking the gallery', async () => {
    const { service, storage } = createService({
      rows: [{ ...attachmentRow, storage_object_path: null }]
    });

    const listed = await service.list('Bearer valid.jwt', tenantId, {});
    expect(listed.items[0]?.url).toBeNull();
    expect(storage.createSignedUrls).not.toHaveBeenCalled();
  });

  it('asks for one more row to know whether another page exists', async () => {
    const extra = Array.from({ length: 31 }, (_, index) => ({
      ...attachmentRow,
      id: `66666666-6666-4666-8666-6666666666${String(index).padStart(2, '0')}`
    }));
    const { service } = createService({ rows: extra });

    const listed = await service.list('Bearer valid.jwt', tenantId, { limit: 30 });
    expect(listed.items).toHaveLength(30);
    expect(listed.nextCursor).not.toBeNull();
    expect(
      encodeMediaCursor({ createdAt: listed.items[29]!.createdAt, id: listed.items[29]!.id })
    ).toBe(listed.nextCursor);
  });

  it('rejects a cursor that the application did not issue', async () => {
    const { service } = createService({});

    await expect(
      service.list('Bearer valid.jwt', tenantId, { cursor: 'inventado' })
    ).rejects.toThrow(BadRequestException);
  });

  it('requires membership before showing any media', async () => {
    const { service, storage } = createService({ canAccess: false });

    await expect(service.list('Bearer valid.jwt', tenantId, {})).rejects.toThrow('forbidden');
    expect(storage.createSignedUrls).not.toHaveBeenCalled();
  });

  it('returns nothing when the search term has no characters left to match', async () => {
    const { service, storage } = createService({});

    await expect(service.list('Bearer valid.jwt', tenantId, { search: ' %%% ' })).resolves.toEqual({
      items: [],
      nextCursor: null
    });
    expect(storage.createSignedUrls).not.toHaveBeenCalled();
  });
});
