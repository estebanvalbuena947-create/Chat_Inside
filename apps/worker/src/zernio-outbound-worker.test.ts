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

/**
 * El adjunto saliente del trabajador.
 *
 * Dos reglas y las dos se ven aqui:
 *   1. El bucket lo declara la fila. Antes estaba escrito a mano (`branch-media`), y con la carga de
 *      una conversacion viviendo en otro bucket eso dejaba sin enlace la mitad de los adjuntos.
 *   2. Un adjunto que no se puede firmar NO se ignora: el evento falla de forma reintentable y el
 *      mensaje vuelve a la cola, en vez de salir sin el archivo y marcarse como enviado.
 */
describe('ZernioOutboundWorker envio con adjunto', () => {
  function createAttachmentClientFake(options: {
    attachment?: Record<string, unknown>;
    signError?: unknown;
    signed?: boolean;
  }) {
    const bucketsFirmados: string[] = [];
    const calls: Array<{ args: unknown[]; metodo: string; tabla: string }> = [];
    const seen: Record<string, number> = {};
    const respuestas: Record<string, FakeResponse[]> = {
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
            body: 'Aqui tienes la foto',
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
      message_attachments: [{ data: options.attachment ? [options.attachment] : [], error: null }],
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
    };
    const siguiente = (tabla: string): FakeResponse => {
      const index = seen[tabla] ?? 0;
      seen[tabla] = index + 1;
      return respuestas[tabla]?.[index] ?? { data: null, error: null };
    };

    const client = {
      from: (tabla: string) => {
        const builder: Record<string, unknown> = {};
        for (const method of ['eq', 'is', 'limit', 'lt', 'lte', 'order', 'select']) {
          builder[method] = (...args: unknown[]) => {
            calls.push({ args, metodo: method, tabla });
            return builder;
          };
        }
        builder.update = (...args: unknown[]) => {
          calls.push({ args, metodo: 'update', tabla });
          return builder;
        };
        builder.then = (resolve: (value: FakeResponse) => unknown) =>
          Promise.resolve(siguiente(tabla)).then(resolve);
        builder.maybeSingle = () => Promise.resolve(siguiente(tabla));
        return builder;
      },
      storage: {
        from: (bucket: string) => ({
          createSignedUrls: async (paths: string[]) => {
            bucketsFirmados.push(bucket);
            if (options.signError) return { data: null, error: options.signError };
            return {
              data:
                options.signed === false
                  ? []
                  : paths.map((path) => ({
                      path,
                      signedUrl: `https://storage.test/${bucket}/${path}`
                    })),
              error: null
            };
          }
        })
      }
    };
    return { bucketsFirmados, calls, client };
  }

  function actualizacionDeMensaje(
    calls: Array<{ args: unknown[]; metodo: string; tabla: string }>,
    estado: string
  ): unknown {
    return calls.find(
      (call) =>
        call.tabla === 'messages' &&
        call.metodo === 'update' &&
        (call.args[0] as { status?: string } | undefined)?.status === estado
    )?.args[0];
  }

  /** El bucket que la fila declara es el que se firma, sea cual sea. */
  for (const bucket of ['branch-media', 'conversation-media']) {
    it(`firma el adjunto contra el bucket que declara su fila (${bucket})`, async () => {
      const { bucketsFirmados, client } = createAttachmentClientFake({
        attachment: { bucket, kind: 'image', storage_object_path: 'carpeta/foto.jpg' }
      });
      const dispatcher = { send: vi.fn(async () => ({ providerMessageId: 'p-1', sentAt: null })) };
      const logInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);

      try {
        await new ZernioOutboundWorker(() => client as never, dispatcher as never).drain();

        expect(bucketsFirmados).toEqual([bucket]);
        expect(dispatcher.send).toHaveBeenCalledWith(
          expect.objectContaining({
            attachment: {
              kind: 'image',
              url: `https://storage.test/${bucket}/carpeta/foto.jpg`
            }
          })
        );
      } finally {
        logInfo.mockRestore();
      }
    });
  }

  it('un mensaje de solo texto se envia sin adjunto, como siempre', async () => {
    const { client } = createAttachmentClientFake({});
    const dispatcher = { send: vi.fn(async () => ({ providerMessageId: 'p-1', sentAt: null })) };
    const logInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    try {
      await new ZernioOutboundWorker(() => client as never, dispatcher as never).drain();

      const [input] = dispatcher.send.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(input.attachment).toBeUndefined();
    } finally {
      logInfo.mockRestore();
    }
  });

  /**
   * El caso que antes era silencioso: hay fila con archivo y la direccion no se puede obtener. El
   * mensaje NO sale sin el archivo; el evento queda reintentable y el mensaje vuelve a la cola.
   */
  for (const [escenario, opciones, codigo] of [
    [
      'el almacen devuelve un enlace que no corresponde',
      { signed: false },
      'outbox_attachment_unavailable'
    ],
    ['el almacen no responde', { signError: { message: 'caido' } }, 'outbox_attachment_sign_failed']
  ] as Array<[string, { signError?: unknown; signed?: boolean }, string]>) {
    it(`no envia el mensaje sin su archivo cuando ${escenario}`, async () => {
      const { calls, client } = createAttachmentClientFake({
        attachment: {
          bucket: 'conversation-media',
          kind: 'image',
          storage_object_path: 'foto.jpg'
        },
        ...opciones
      });
      const dispatcher = { send: vi.fn(async () => ({ providerMessageId: 'p-1', sentAt: null })) };
      const logInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      const logError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      try {
        await new ZernioOutboundWorker(() => client as never, dispatcher as never).drain();

        expect(dispatcher.send).not.toHaveBeenCalled();
        const cierre = calls.find(
          (call) =>
            call.tabla === 'outbox_events' &&
            call.metodo === 'update' &&
            (call.args[0] as { failure_code?: string } | undefined)?.failure_code === codigo
        );
        // Reintentable: el evento vuelve a la cola y el mensaje tambien.
        expect(cierre?.args[0]).toMatchObject({ failure_code: codigo, state: 'pending' });
        expect(actualizacionDeMensaje(calls, 'queued')).toEqual({ status: 'queued' });
      } finally {
        logInfo.mockRestore();
        logError.mockRestore();
      }
    });
  }
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
