import { describe, expect, it, vi } from 'vitest';
import { ABANDONED_CLAIM_MS } from './abandoned-claims';
import {
  createOrAdoptConversation,
  synchronizeChannelName,
  synchronizeChannelPlatform,
  ZernioInboxWorker
} from './zernio-inbox-worker';

type FakeResponse = { data: unknown; error: unknown };

/** Cliente falso que registra la cadena de cada consulta y responde en orden. */
function createClientFake(responses: FakeResponse[]) {
  const calls: Array<{ args: unknown[]; method: string }> = [];
  let index = 0;
  const from = vi.fn(() => {
    const builder: Record<string, unknown> = {};
    for (const method of ['eq', 'is', 'limit', 'lt', 'lte', 'order', 'select', 'update']) {
      builder[method] = (...args: unknown[]) => {
        calls.push({ args, method });
        return builder;
      };
    }
    builder.then = (resolve: (value: FakeResponse) => unknown) =>
      Promise.resolve(responses[index++] ?? { data: [], error: null }).then(resolve);
    return builder;
  });

  return { calls, client: { from }, from };
}

describe('ZernioInboxWorker', () => {
  it('writes a verified platform only for the resolved tenant channel account', async () => {
    const query = { eq: vi.fn().mockReturnThis() };
    const update = vi.fn(() => query);
    const client = { from: vi.fn(() => ({ update })) };

    await synchronizeChannelPlatform(
      client as never,
      'tenant-1',
      { display_name: null, id: 'channel-1', platform: null },
      'instagram'
    );

    expect(client.from).toHaveBeenCalledWith('channel_accounts');
    expect(update).toHaveBeenCalledWith({ platform: 'instagram' });
    expect(query.eq).toHaveBeenNthCalledWith(1, 'id', 'channel-1');
    expect(query.eq).toHaveBeenNthCalledWith(2, 'tenant_id', 'tenant-1');
  });

  it('fills an empty channel name from the provider, guarded so it cannot overwrite it', async () => {
    const query = { eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis() };
    const update = vi.fn(() => query);
    const client = { from: vi.fn(() => ({ update })) };

    await synchronizeChannelName(
      client as never,
      'tenant-1',
      { display_name: null, id: 'channel-1', platform: 'instagram' },
      'insidespamx'
    );

    expect(update).toHaveBeenCalledWith({ display_name: 'insidespamx' });
    expect(query.is).toHaveBeenCalledWith('display_name', null);
  });

  it('never replaces a name chosen by the team, nor writes without a provider name', async () => {
    const update = vi.fn();
    const client = { from: vi.fn(() => ({ update })) };

    await synchronizeChannelName(
      client as never,
      'tenant-1',
      { display_name: 'Instagram ventas', id: 'channel-1', platform: 'instagram' },
      'insidespamx'
    );
    await synchronizeChannelName(
      client as never,
      'tenant-1',
      { display_name: null, id: 'channel-1', platform: 'instagram' },
      null
    );

    expect(client.from).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('does not write a missing or unchanged platform', async () => {
    const update = vi.fn();
    const client = { from: vi.fn(() => ({ update })) };

    await synchronizeChannelPlatform(
      client as never,
      'tenant-1',
      { display_name: null, id: 'channel-1', platform: 'instagram' },
      'instagram'
    );
    await synchronizeChannelPlatform(
      client as never,
      'tenant-1',
      { display_name: null, id: 'channel-1', platform: null },
      null
    );

    expect(client.from).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps the worker alive when the inbox query is temporarily unavailable', async () => {
    const query = {
      is: vi.fn(),
      limit: vi.fn(),
      order: vi.fn(),
      select: vi.fn()
    };
    query.select.mockReturnValue(query);
    query.is.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockResolvedValue({ data: null, error: { code: 'temporary_failure' } });

    const client = { from: vi.fn(() => query) };
    const logError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(new ZernioInboxWorker(() => client as never).drain()).resolves.toBeUndefined();
      expect(logError).toHaveBeenCalledWith(
        JSON.stringify({
          event: 'worker.inbox_list_failed',
          failureCode: 'webhook_event_list_failed',
          databaseCode: 'temporary_failure'
        })
      );
    } finally {
      logError.mockRestore();
    }
  });

  it('returns an abandoned claim to the queue and reports the recovery', async () => {
    const now = Date.parse('2026-09-28T21:00:00.000Z');
    const { calls, client } = createClientFake([{ data: [{ id: 'event-1' }], error: null }]);
    const logInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    try {
      await new ZernioInboxWorker(
        () => client as never,
        () => now
      ).drain();

      expect(calls).toEqual(
        expect.arrayContaining([
          { args: [{ processing_started_at: null }], method: 'update' },
          { args: ['processed_at', null], method: 'is' },
          { args: ['failed_at', null], method: 'is' },
          {
            args: ['processing_started_at', new Date(now - ABANDONED_CLAIM_MS).toISOString()],
            method: 'lt'
          }
        ])
      );
      // Solo se limpia el reclamo: nunca se marca como procesado ni como fallido.
      expect(calls.filter((call) => call.method === 'update')).toHaveLength(1);
      expect(logInfo).toHaveBeenCalledWith(
        JSON.stringify({ event: 'worker.claim_reclaimed', reclaimed: 1 })
      );
    } finally {
      logInfo.mockRestore();
    }
  });

  it('does not recover again inside the interval, so a stuck event is not hammered', async () => {
    const now = Date.parse('2026-09-28T21:00:00.000Z');
    const { calls, client } = createClientFake([]);
    const worker = new ZernioInboxWorker(
      () => client as never,
      () => now
    );

    await worker.drain();
    await worker.drain();

    expect(calls.filter((call) => call.method === 'update')).toHaveLength(1);
  });

  it('reports a failed recovery without stopping the drain', async () => {
    const now = Date.parse('2026-09-28T21:00:00.000Z');
    const { client } = createClientFake([{ data: null, error: { code: 'temporary_failure' } }]);
    const logError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await expect(
        new ZernioInboxWorker(
          () => client as never,
          () => now
        ).drain()
      ).resolves.toBeUndefined();
      expect(logError).toHaveBeenCalledWith(
        JSON.stringify({
          event: 'worker.claim_reclaim_failed',
          databaseCode: 'temporary_failure'
        })
      );
    } finally {
      logError.mockRestore();
    }
  });
});

/** Cliente falso: el insert responde `insertResult` y la busqueda posterior, `racedResult`. */
function createConversationClient(
  insertResult: FakeResponse,
  racedResult: FakeResponse = { data: null, error: null }
) {
  const builder: Record<string, unknown> = {};
  builder.insert = vi.fn(() => builder);
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.single = vi.fn(() => Promise.resolve(insertResult));
  builder.maybeSingle = vi.fn(() => Promise.resolve(racedResult));
  const from = vi.fn(() => builder);
  return { builder, client: { from }, from };
}

const conversationParams = {
  channelAccountId: 'channel-1',
  contactId: 'contact-1',
  conversationReference: 'zernio:account-1:conversation:thread-1',
  tenantId: 'tenant-1'
};

describe('createOrAdoptConversation', () => {
  it('creates the conversation when nothing raced', async () => {
    const fila = { id: 'conv-1', last_message_at: null, status: 'open', status_version: 1 };
    const { client } = createConversationClient({ data: fila, error: null });

    await expect(createOrAdoptConversation(client as never, conversationParams)).resolves.toEqual(
      fila
    );
  });

  it('adopts the conversation that won the race instead of losing the message', async () => {
    const ganadora = {
      id: 'conv-ganadora',
      last_message_at: null,
      status: 'open',
      status_version: 1
    };
    const { client } = createConversationClient(
      { data: null, error: { code: '23505' } },
      { data: ganadora, error: null }
    );

    await expect(createOrAdoptConversation(client as never, conversationParams)).resolves.toEqual(
      ganadora
    );
  });

  it('returns null when the failure is not a duplicate', async () => {
    const { client } = createConversationClient({ data: null, error: { code: '23503' } });

    await expect(
      createOrAdoptConversation(client as never, conversationParams)
    ).resolves.toBeNull();
  });

  it('returns null when it was a duplicate but the winner cannot be found', async () => {
    const { client } = createConversationClient(
      { data: null, error: { code: '23505' } },
      { data: null, error: null }
    );

    await expect(
      createOrAdoptConversation(client as never, conversationParams)
    ).resolves.toBeNull();
  });
});
