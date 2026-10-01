import { describe, expect, it, vi } from 'vitest';
import {
  isMediaRepairDue,
  MEDIA_REPAIR_INTERVAL_MS,
  MEDIA_RETRY_BACKOFF_MS,
  repairPendingMedia
} from './media-repair';

const storeConversationMedia = vi.fn();
vi.mock('./conversation-media-storage', () => ({
  storeConversationMedia: (...args: unknown[]) => storeConversationMedia(...args)
}));

const pendingRow = {
  conversation_id: 'conversation-1',
  download_attempts: 0,
  download_failed_at: null,
  id: 'adjunto-1',
  kind: 'share',
  message_id: 'message-1',
  ordinal: 0,
  source_title: null,
  source_url: 'https://cdn.example.test/publicacion.mp4',
  tenant_id: 'tenant-1'
};

type Recorded = { args: unknown[]; method: string };

/**
 * Cliente falso por tabla: la lectura de pendientes, la busqueda del mensaje, la busqueda del
 * payload original y la escritura del resultado.
 */
function createClient(input: { events?: unknown[]; messages?: unknown[]; rows?: unknown[] }) {
  const attachments: Recorded[] = [];
  const other: Recorded[] = [];

  const attachmentsBuilder: Record<string, unknown> = {};
  for (const method of ['is', 'lt', 'order']) {
    attachmentsBuilder[method] = vi.fn((...args: unknown[]) => {
      attachments.push({ args, method });
      return attachmentsBuilder;
    });
  }
  attachmentsBuilder.select = vi.fn(() => attachmentsBuilder);
  attachmentsBuilder.limit = vi.fn(() => Promise.resolve({ data: input.rows ?? [], error: null }));
  attachmentsBuilder.update = vi.fn((payload: unknown) => {
    attachments.push({ args: [payload], method: 'update' });
    return attachmentsBuilder;
  });
  attachmentsBuilder.eq = vi.fn((...args: unknown[]) => {
    attachments.push({ args, method: 'eq' });
    return attachmentsBuilder;
  });
  attachmentsBuilder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null }).then(resolve);

  const messageBuilder: Record<string, unknown> = {
    eq: vi.fn(() => messageBuilder),
    maybeSingle: vi.fn(() => Promise.resolve({ data: input.messages?.[0] ?? null, error: null })),
    select: vi.fn(() => messageBuilder)
  };
  const eventBuilder: Record<string, unknown> = {
    eq: vi.fn(() => eventBuilder),
    limit: vi.fn(() => eventBuilder),
    maybeSingle: vi.fn(() => Promise.resolve({ data: input.events?.[0] ?? null, error: null })),
    select: vi.fn(() => eventBuilder)
  };

  const client = {
    from: (table: string) => {
      if (table === 'message_attachments') return attachmentsBuilder;
      if (table === 'messages') return messageBuilder;
      return eventBuilder;
    }
  };

  return { attachments, client, other };
}

describe('media repair pass', () => {
  it('runs on its own interval, not on every cycle', () => {
    const now = 1_000_000;
    expect(isMediaRepairDue(now, now)).toBe(false);
    expect(isMediaRepairDue(now, now + MEDIA_REPAIR_INTERVAL_MS - 1)).toBe(false);
    expect(isMediaRepairDue(now, now + MEDIA_REPAIR_INTERVAL_MS)).toBe(true);
  });

  it('copies a pending attachment and recovers the text of a shared publication', async () => {
    storeConversationMedia.mockReset();
    storeConversationMedia.mockResolvedValue({
      byteSize: 1400,
      contentType: 'video/mp4',
      path: 'tenant/conversation/message/0.mp4'
    });
    const { attachments, client } = createClient({
      events: [
        {
          payload: {
            message: {
              attachments: [
                {
                  originalType: 'ig_post',
                  payload: { title: 'd\u00c3\u00adas de descanso' },
                  type: 'share'
                }
              ]
            }
          }
        }
      ],
      messages: [{ provider_message_id: 'zernio:account-1:message:message-1' }],
      rows: [pendingRow]
    });

    await expect(
      repairPendingMedia(client as never, new Date('2026-09-29T20:00:00.000Z').getTime())
    ).resolves.toBe(1);

    const update = attachments.find((call) => call.method === 'update')?.args[0] as Record<
      string,
      unknown
    >;
    expect(update).toMatchObject({
      download_attempts: 1,
      source_kind: 'ig_post',
      source_title: 'd\u00edas de descanso',
      storage_object_path: 'tenant/conversation/message/0.mp4'
    });
  });

  it('marks the attempt when the link no longer delivers the file, without throwing', async () => {
    storeConversationMedia.mockReset();
    storeConversationMedia.mockResolvedValue(null);
    const { attachments, client } = createClient({ rows: [pendingRow] });

    await expect(repairPendingMedia(client as never)).resolves.toBe(0);

    const update = attachments.find((call) => call.method === 'update')?.args[0] as Record<
      string,
      unknown
    >;
    expect(update.download_attempts).toBe(1);
    expect(update).toHaveProperty('download_failed_at');
    expect(update).not.toHaveProperty('storage_object_path');
  });

  it('waits before insisting on an attachment that just failed', async () => {
    storeConversationMedia.mockReset();
    const now = new Date('2026-09-29T20:00:00.000Z').getTime();
    const { attachments, client } = createClient({
      rows: [
        {
          ...pendingRow,
          download_attempts: 1,
          download_failed_at: new Date(now - MEDIA_RETRY_BACKOFF_MS / 2).toISOString()
        }
      ]
    });

    await expect(repairPendingMedia(client as never, now)).resolves.toBe(0);
    expect(storeConversationMedia).not.toHaveBeenCalled();
    expect(attachments.find((call) => call.method === 'update')).toBeUndefined();
  });
});
