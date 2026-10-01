import { describe, expect, it, vi } from 'vitest';
import { ABANDONED_CLAIM_MS } from './abandoned-claims';
import {
  conversationIdFromReference,
  createZernioDispatcher,
  ZernioDispatchError,
  ZernioOutboundWorker
} from './zernio-outbound-worker';

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

  return { calls, client: { from } };
}

describe('Zernio outbound adapter', () => {
  it('uses the opaque conversation reference and the stable idempotency key', async () => {
    const request = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { messageId: 'provider-message-1', sentAt: '2026-08-14T12:00:00Z' },
            success: true
          }),
          { status: 200 }
        )
    );
    const dispatcher = createZernioDispatcher('test-key', request as typeof fetch);

    await expect(
      dispatcher.send({
        accountId: 'account-1',
        body: 'Mensaje de prueba',
        conversationId: 'conversation/opaque',
        idempotencyKey: 'request-1'
      })
    ).resolves.toEqual({ providerMessageId: 'provider-message-1', sentAt: '2026-08-14T12:00:00Z' });

    expect(request).toHaveBeenCalledWith(
      'https://zernio.com/api/v1/inbox/conversations/conversation%2Fopaque/messages',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': 'request-1' }),
        method: 'POST'
      })
    );
  });

  it('marks a provider conflict as retryable without creating a new key', async () => {
    const dispatcher = createZernioDispatcher(
      'test-key',
      (async () => new Response('{}', { status: 409 })) as typeof fetch
    );

    await expect(
      dispatcher.send({
        accountId: 'account-1',
        body: 'x',
        conversationId: 'c',
        idempotencyKey: 'stable'
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<ZernioDispatchError>>({
        code: 'zernio_http_409',
        retryable: true
      })
    );
  });

  it('accepts only a conversation reference scoped to its channel account', () => {
    expect(
      conversationIdFromReference('zernio:account-1:conversation:provider-id', 'account-1')
    ).toBe('provider-id');
    expect(
      conversationIdFromReference('zernio:account-2:conversation:provider-id', 'account-1')
    ).toBeNull();
  });

  it('does not accept a successful response that cannot identify the provider message', async () => {
    const dispatcher = createZernioDispatcher(
      'test-key',
      (async () => new Response(JSON.stringify({ success: true }), { status: 200 })) as typeof fetch
    );

    await expect(
      dispatcher.send({
        accountId: 'account-1',
        body: 'x',
        conversationId: 'c',
        idempotencyKey: 'stable'
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<ZernioDispatchError>>({
        code: 'zernio_send_response_invalid',
        retryable: true
      })
    );
  });

  it('accepts a provider acknowledgement that omits the optional sent timestamp', async () => {
    const dispatcher = createZernioDispatcher(
      'test-key',
      (async () =>
        new Response(
          JSON.stringify({
            data: { messageId: 'provider-message-2', conversationId: 'conversation-1' },
            success: true
          }),
          { status: 200 }
        )) as typeof fetch
    );

    await expect(
      dispatcher.send({
        accountId: 'account-1',
        body: 'x',
        conversationId: 'c',
        idempotencyKey: 'stable'
      })
    ).resolves.toEqual({ providerMessageId: 'provider-message-2', sentAt: null });
  });
});

describe('ZernioOutboundWorker abandoned dispatch recovery', () => {
  it('returns an abandoned dispatch to the queue instead of losing the reply', async () => {
    const now = Date.parse('2026-09-28T21:00:00.000Z');
    const { calls, client } = createClientFake([{ data: [{ id: 'outbox-1' }], error: null }]);
    const dispatcher = { send: vi.fn() };
    const logInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    try {
      await new ZernioOutboundWorker(
        () => client as never,
        dispatcher as never,
        () => now
      ).drain();

      expect(calls).toEqual(
        expect.arrayContaining([
          {
            args: [
              {
                available_at: new Date(now).toISOString(),
                processing_started_at: null,
                state: 'pending'
              }
            ],
            method: 'update'
          },
          { args: ['state', 'processing'], method: 'eq' },
          {
            args: ['processing_started_at', new Date(now - ABANDONED_CLAIM_MS).toISOString()],
            method: 'lt'
          }
        ])
      );
      expect(dispatcher.send).not.toHaveBeenCalled();
      expect(logInfo).toHaveBeenCalledWith(
        JSON.stringify({ event: 'worker.outbox_dispatch_reclaimed', reclaimed: 1 })
      );
    } finally {
      logInfo.mockRestore();
    }
  });

  it('does not recover again inside the interval', async () => {
    const now = Date.parse('2026-09-28T21:00:00.000Z');
    const { calls, client } = createClientFake([]);
    const worker = new ZernioOutboundWorker(
      () => client as never,
      { send: vi.fn() } as never,
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
        new ZernioOutboundWorker(
          () => client as never,
          { send: vi.fn() } as never,
          () => now
        ).drain()
      ).resolves.toBeUndefined();
      expect(logError).toHaveBeenCalledWith(
        JSON.stringify({
          event: 'worker.outbox_dispatch_reclaim_failed',
          databaseCode: 'temporary_failure'
        })
      );
    } finally {
      logError.mockRestore();
    }
  });
});
