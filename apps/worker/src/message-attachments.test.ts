import { describe, expect, it, vi } from 'vitest';
import { storeMessageAttachments } from './zernio-inbox-worker';

const storeConversationMedia = vi.fn();
vi.mock('./conversation-media-storage', () => ({
  storeConversationMedia: (...args: unknown[]) => storeConversationMedia(...args)
}));

type Recorded = { args: unknown[]; method: string };

function createClient(input: {
  existing?: { id: string; storage_object_path: string | null } | null;
  insertError?: { code: string } | null;
  inserted?: { id: string } | null;
}) {
  const calls: Recorded[] = [];
  const insert = vi.fn((payload: unknown) => {
    calls.push({ args: [payload], method: 'insert' });
    return builder;
  });
  const update = vi.fn((payload: unknown) => {
    calls.push({ args: [payload], method: 'update' });
    return builder;
  });
  const builder: Record<string, unknown> = {
    eq: vi.fn((...args: unknown[]) => {
      calls.push({ args, method: 'eq' });
      return builder;
    }),
    insert,
    maybeSingle: vi.fn(() => {
      // El primero en resolverse es la busqueda previa; el segundo, la insercion.
      return Promise.resolve({ data: input.existing ?? null, error: null });
    }),
    select: vi.fn(() => builder),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null }).then(resolve),
    update
  };

  // La busqueda previa y la insercion comparten constructor: se distingue por la llamada.
  let lookupDone = false;
  builder.maybeSingle = vi.fn(() => {
    if (!lookupDone) {
      lookupDone = true;
      return Promise.resolve({ data: input.existing ?? null, error: null });
    }
    return Promise.resolve({
      data: input.inserted ?? { id: 'adjunto-1' },
      error: input.insertError ?? null
    });
  });

  return { calls, client: { from: () => builder } };
}

const incoming = {
  attachments: [
    { kind: 'image' as const, ordinal: 0, sourceUrl: 'https://cdn.example.test/foto.jpg' }
  ],
  body: '',
  contactDisplayName: 'Iván',
  contactPhoneNumber: null,
  contactReference: 'zernio:a:contact:c',
  contactUsername: null,
  conversationReference: 'zernio:a:conversation:k',
  messageReference: 'zernio:a:message:m',
  platform: 'instagram',
  receivedAt: '2026-09-29T03:57:56.761Z',
  accountId: 'a',
  accountName: null,
  avatarSourceUrl: null
} as never;

describe('storeMessageAttachments', () => {
  it('records the attachment and stores the copy with its real type and size', async () => {
    storeConversationMedia.mockReset();
    storeConversationMedia.mockResolvedValue({
      byteSize: 2048,
      contentType: 'image/jpeg',
      path: 'tenant/conversation/message/0.jpg'
    });
    const { calls, client } = createClient({ existing: null, inserted: { id: 'adjunto-1' } });

    await storeMessageAttachments(
      client as never,
      'tenant-1',
      'conversation-1',
      'message-1',
      incoming
    );

    expect(calls).toContainEqual({
      args: [
        expect.objectContaining({
          conversation_id: 'conversation-1',
          kind: 'image',
          message_id: 'message-1',
          ordinal: 0,
          source_url: 'https://cdn.example.test/foto.jpg'
        })
      ],
      method: 'insert'
    });
    expect(calls).toContainEqual({
      args: [
        expect.objectContaining({
          byte_size: 2048,
          content_type: 'image/jpeg',
          storage_object_path: 'tenant/conversation/message/0.jpg'
        })
      ],
      method: 'update'
    });
  });

  it('keeps the message working when the copy cannot be made, and leaves a trace', async () => {
    storeConversationMedia.mockReset();
    storeConversationMedia.mockResolvedValue(null);
    const { calls, client } = createClient({ existing: null, inserted: { id: 'adjunto-1' } });

    await expect(
      storeMessageAttachments(client as never, 'tenant-1', 'conversation-1', 'message-1', incoming)
    ).resolves.toBeUndefined();

    const update = calls.find((call) => call.method === 'update')?.args[0] as Record<
      string,
      unknown
    >;
    expect(update).toHaveProperty('download_failed_at');
    expect(update).not.toHaveProperty('storage_object_path');
  });

  it('does not download again when the copy already exists', async () => {
    storeConversationMedia.mockReset();
    const { client } = createClient({
      existing: { id: 'adjunto-1', storage_object_path: 'tenant/conversation/message/0.jpg' }
    });

    await storeMessageAttachments(
      client as never,
      'tenant-1',
      'conversation-1',
      'message-1',
      incoming
    );

    expect(storeConversationMedia).not.toHaveBeenCalled();
  });

  it('also copies a shared publication, because it carries the media of the post', async () => {
    storeConversationMedia.mockReset();
    storeConversationMedia.mockResolvedValue({
      byteSize: 1024,
      contentType: 'video/mp4',
      path: 'tenant/conversation/message/0.mp4'
    });
    const { calls, client } = createClient({ existing: null, inserted: { id: 'adjunto-2' } });

    await storeMessageAttachments(client as never, 'tenant-1', 'conversation-1', 'message-1', {
      ...(incoming as Record<string, unknown>),
      attachments: [
        {
          kind: 'share',
          ordinal: 0,
          sourceKind: 'ig_post',
          sourceUrl: 'https://zernio.test/publicacion',
          title: 'Texto de la publicacion'
        }
      ]
    } as never);

    expect(storeConversationMedia).toHaveBeenCalled();
    expect(calls).toContainEqual({
      args: [
        expect.objectContaining({ source_kind: 'ig_post', source_title: 'Texto de la publicacion' })
      ],
      method: 'insert'
    });
  });

  it('never fails the message because the attachment could not be recorded', async () => {
    storeConversationMedia.mockReset();
    const { client } = createClient({ existing: null, insertError: { code: '42501' } });

    await expect(
      storeMessageAttachments(client as never, 'tenant-1', 'conversation-1', 'message-1', incoming)
    ).resolves.toBeUndefined();
  });
});
