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

  it('sends the template reference instead of free text', async () => {
    const request = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { messageId: 'provider-message-9' }, success: true }), {
          status: 200
        })
    );
    const dispatcher = createZernioDispatcher('test-key', request as typeof fetch);

    await dispatcher.send({
      accountId: 'account-1',
      body: 'Hola, confirmamos tu reservacion.',
      conversationId: 'conversation-1',
      idempotencyKey: 'request-9',
      whatsappTemplate: { language: 'es_MX', name: 'notificacion_48h' }
    });

    const [, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    const cuerpo = JSON.parse(String(init.body)) as Record<string, unknown>;
    // La carga es la referencia: el proveedor resuelve el par exacto y no acepta texto en su lugar.
    expect(cuerpo.template).toEqual({
      elements: [{ language: 'es_MX', name: 'notificacion_48h' }]
    });
    expect(cuerpo.message).toBeUndefined();
    expect(cuerpo.attachmentUrl).toBeUndefined();
  });

  it('does not retry a template the provider cannot resolve', async () => {
    const dispatcher = createZernioDispatcher(
      'test-key',
      (async () => new Response('{}', { status: 400 })) as typeof fetch
    );

    await expect(
      dispatcher.send({
        accountId: 'account-1',
        body: 'x',
        conversationId: 'c',
        idempotencyKey: 'stable',
        whatsappTemplate: { language: 'pt_BR', name: 'notificacion_48h' }
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<ZernioDispatchError>>({
        code: 'zernio_http_400',
        retryable: false
      })
    );
  });

  it('retries a 502 because the provider uses it for a permanent and a transient cause', async () => {
    const dispatcher = createZernioDispatcher(
      'test-key',
      (async () => new Response('{}', { status: 502 })) as typeof fetch
    );

    await expect(
      dispatcher.send({
        accountId: 'account-1',
        body: 'x',
        conversationId: 'c',
        idempotencyKey: 'stable',
        whatsappTemplate: { language: 'es_MX', name: 'notificacion_48h' }
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<ZernioDispatchError>>({
        code: 'zernio_http_502',
        retryable: true
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

describe('ZernioOutboundWorker envio con plantilla', () => {
  /** Cliente falso que responde por tabla, en el orden en que el trabajador la consulta. */
  function createTableClientFake(responses: Record<string, FakeResponse[]>) {
    const seen: Record<string, number> = {};
    const siguiente = (table: string, vacio: FakeResponse): FakeResponse => {
      const index = seen[table] ?? 0;
      seen[table] = index + 1;
      return responses[table]?.[index] ?? vacio;
    };
    const client = {
      from: (table: string) => {
        const builder: Record<string, unknown> = {};
        for (const method of ['eq', 'is', 'limit', 'lt', 'lte', 'order', 'select', 'update']) {
          builder[method] = () => builder;
        }
        builder.then = (resolve: (value: FakeResponse) => unknown) =>
          Promise.resolve(siguiente(table, { data: [], error: null })).then(resolve);
        builder.maybeSingle = () => Promise.resolve(siguiente(table, { data: null, error: null }));
        return builder;
      }
    };
    return { client };
  }

  it('despacha la referencia de la plantilla y nunca su texto visible', async () => {
    const { client } = createTableClientFake({
      channel_accounts: [
        { data: { provider: 'zernio', provider_account_id: 'cuenta-1' }, error: null }
      ],
      conversations: [
        {
          data: {
            channel_account_id: 'canal-1',
            external_reference: 'zernio:cuenta-1:conversation:proveedor-1'
          },
          error: null
        }
      ],
      messages: [
        {
          data: {
            body: 'Hola, confirmamos tu reservacion.',
            channel_account_id: 'canal-1',
            conversation_id: 'conversacion-1',
            id: 'mensaje-1',
            idempotency_key: 'clave-1',
            status: 'queued',
            whatsapp_template_language: 'es_MX',
            whatsapp_template_name: 'notificacion_48h'
          },
          error: null
        },
        { data: null, error: null },
        { data: null, error: null }
      ],
      outbox_events: [
        { data: [], error: null },
        {
          data: [
            { attempts: 0, id: 'outbox-1', payload: { messageId: 'mensaje-1' }, tenant_id: 't-1' }
          ],
          error: null
        },
        { data: { id: 'outbox-1' }, error: null },
        { data: null, error: null }
      ]
    });
    const dispatcher = { send: vi.fn(async () => ({ providerMessageId: 'p-1', sentAt: null })) };
    const logInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    try {
      await new ZernioOutboundWorker(() => client as never, dispatcher as never).drain();

      expect(dispatcher.send).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'cuenta-1',
          body: 'Hola, confirmamos tu reservacion.',
          conversationId: 'proveedor-1',
          idempotencyKey: 'clave-1',
          whatsappTemplate: { language: 'es_MX', name: 'notificacion_48h' }
        })
      );
    } finally {
      logInfo.mockRestore();
    }
  });

  it('un mensaje de texto sigue saliendo sin plantilla', async () => {
    const { client } = createTableClientFake({
      channel_accounts: [
        { data: { provider: 'zernio', provider_account_id: 'cuenta-1' }, error: null }
      ],
      conversations: [
        {
          data: {
            channel_account_id: 'canal-1',
            external_reference: 'zernio:cuenta-1:conversation:proveedor-1'
          },
          error: null
        }
      ],
      messages: [
        {
          data: {
            body: 'Hola',
            channel_account_id: 'canal-1',
            conversation_id: 'conversacion-1',
            id: 'mensaje-1',
            idempotency_key: 'clave-1',
            status: 'queued',
            whatsapp_template_language: null,
            whatsapp_template_name: null
          },
          error: null
        },
        { data: null, error: null },
        { data: null, error: null }
      ],
      outbox_events: [
        { data: [], error: null },
        {
          data: [
            { attempts: 0, id: 'outbox-1', payload: { messageId: 'mensaje-1' }, tenant_id: 't-1' }
          ],
          error: null
        },
        { data: { id: 'outbox-1' }, error: null },
        { data: null, error: null }
      ]
    });
    const dispatcher = { send: vi.fn(async () => ({ providerMessageId: 'p-1', sentAt: null })) };
    const logInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    try {
      await new ZernioOutboundWorker(() => client as never, dispatcher as never).drain();

      const [input] = dispatcher.send.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(input.whatsappTemplate).toBeUndefined();
      expect(input.body).toBe('Hola');
    } finally {
      logInfo.mockRestore();
    }
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
