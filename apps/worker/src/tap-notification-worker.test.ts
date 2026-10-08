import { describe, expect, it, vi } from 'vitest';
import { N8nDeliveryError } from './n8n-transport';
import { TapNotificationWorker, createTapNotificationWorker } from './tap-notification-worker';

type FakeResponse = { data: unknown; error: unknown };

const event = {
  attempts: 0,
  id: 'outbox-1',
  idempotency_key: '66666666-6666-4666-8666-666666666666',
  payload: {
    buttonPayload: 'Asistiré',
    contactId: '33333333-3333-4333-8333-333333333333',
    conversationId: '44444444-4444-4444-8444-444444444444',
    event: 'whatsapp.button_tap',
    messageId: '55555555-5555-4555-8555-555555555555',
    occurredAt: '2026-10-08T18:57:29.122Z',
    template: { language: 'es_MX', name: 'notificacion_48h' }
  },
  tenant_id: '11111111-1111-4111-8111-111111111111'
};

/** Cliente falso que responde por tabla, en el orden en que el trabajador la consulta. */
function createClientFake(responses: Record<string, FakeResponse[]>) {
  const calls: Array<{ args: unknown[]; method: string; table: string }> = [];
  const seen: Record<string, number> = {};
  const next = (table: string, vacio: FakeResponse): FakeResponse => {
    const index = seen[table] ?? 0;
    seen[table] = index + 1;
    return responses[table]?.[index] ?? vacio;
  };
  const client = {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      for (const method of ['eq', 'is', 'limit', 'lt', 'lte', 'order', 'select', 'update']) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ args, method, table });
          return builder;
        };
      }
      builder.then = (resolve: (value: FakeResponse) => unknown) =>
        Promise.resolve(next(table, { data: [], error: null })).then(resolve);
      builder.maybeSingle = () => Promise.resolve(next(table, { data: null, error: null }));
      return builder;
    }
  };
  return { calls, client };
}

const ABANDONED_RECLAIM = { data: [], error: null };

function createWorker(options: {
  responses: Record<string, FakeResponse[]>;
  transport: { notify: ReturnType<typeof vi.fn> };
  now?: number;
}) {
  const fake = createClientFake(options.responses);
  const worker = new TapNotificationWorker(
    () => fake.client as never,
    options.transport as never,
    () => options.now ?? Date.parse('2026-10-08T19:00:00.000Z')
  );
  return { calls: fake.calls, worker };
}

describe('despacho de avisos a n8n', () => {
  it('entrega el aviso con su clave y cierra el evento', async () => {
    const notify = vi.fn(async () => undefined);
    const { worker } = createWorker({
      responses: {
        outbox_events: [
          ABANDONED_RECLAIM,
          { data: [event], error: null },
          { data: { id: 'outbox-1' }, error: null },
          { data: null, error: null }
        ]
      },
      transport: { notify }
    });

    await worker.drain();

    expect(notify).toHaveBeenCalledWith({
      idempotencyKey: '66666666-6666-4666-8666-666666666666',
      notification: expect.objectContaining({
        buttonPayload: 'Asistiré',
        event: 'whatsapp.button_tap'
      })
    });
  });

  it('un 4xx de n8n queda fallido sin reintento', async () => {
    const notify = vi.fn(async () => {
      throw new N8nDeliveryError(false, 'n8n_http_401');
    });
    const { calls, worker } = createWorker({
      responses: {
        outbox_events: [
          ABANDONED_RECLAIM,
          { data: [event], error: null },
          { data: { id: 'outbox-1' }, error: null },
          { data: null, error: null }
        ]
      },
      transport: { notify }
    });
    const logError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await worker.drain();
      expect(calls).toContainEqual({
        args: [expect.objectContaining({ failure_code: 'n8n_http_401', state: 'failed' })],
        method: 'update',
        table: 'outbox_events'
      });
      expect(logError).toHaveBeenCalledWith(
        JSON.stringify({ event: 'worker.n8n_notification_failed', failureCode: 'n8n_http_401' })
      );
    } finally {
      logError.mockRestore();
    }
  });

  it('un 5xx vuelve a la cola con espera creciente', async () => {
    const notify = vi.fn(async () => {
      throw new N8nDeliveryError(true, 'n8n_http_503');
    });
    const now = Date.parse('2026-10-08T19:00:00.000Z');
    const { calls, worker } = createWorker({
      responses: {
        outbox_events: [
          ABANDONED_RECLAIM,
          { data: [event], error: null },
          { data: { id: 'outbox-1' }, error: null },
          { data: null, error: null }
        ]
      },
      transport: { notify },
      now
    });
    const logError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await worker.drain();
      expect(calls).toContainEqual({
        args: [
          expect.objectContaining({
            available_at: new Date(now + 2_000).toISOString(),
            failure_code: 'n8n_http_503',
            state: 'pending'
          })
        ],
        method: 'update',
        table: 'outbox_events'
      });
    } finally {
      logError.mockRestore();
    }
  });

  it('un aviso guardado con forma invalida falla visiblemente y no sale', async () => {
    const notify = vi.fn();
    const { calls, worker } = createWorker({
      responses: {
        outbox_events: [
          ABANDONED_RECLAIM,
          // Un telefono colado en el aviso: el esquema estricto lo rechaza.
          {
            data: [{ ...event, payload: { ...event.payload, phoneNumber: '+573102453646' } }],
            error: null
          },
          { data: { id: 'outbox-1' }, error: null },
          { data: null, error: null }
        ]
      },
      transport: { notify }
    });
    const logError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      await worker.drain();
      expect(notify).not.toHaveBeenCalled();
      expect(calls).toContainEqual({
        args: [
          expect.objectContaining({ failure_code: 'invalid_tap_notification', state: 'failed' })
        ],
        method: 'update',
        table: 'outbox_events'
      });
    } finally {
      logError.mockRestore();
    }
  });

  it('solo mira los eventos de su clase, no los mensajes de la bandeja', async () => {
    const notify = vi.fn();
    const { calls, worker } = createWorker({
      responses: { outbox_events: [ABANDONED_RECLAIM, { data: [], error: null }] },
      transport: { notify }
    });

    await worker.drain();

    expect(calls).toContainEqual({
      args: ['event_type', 'n8n.whatsapp.button_tap'],
      method: 'eq',
      table: 'outbox_events'
    });
    expect(notify).not.toHaveBeenCalled();
  });

  it('recupera un reclamo abandonado antes de listar', async () => {
    const notify = vi.fn();
    const { calls, worker } = createWorker({
      responses: {
        outbox_events: [
          { data: [{ id: 'outbox-1' }], error: null },
          { data: [], error: null }
        ]
      },
      transport: { notify }
    });
    const logInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    try {
      await worker.drain();
      expect(logInfo).toHaveBeenCalledWith(
        JSON.stringify({ event: 'worker.n8n_notifications_reclaimed', reclaimed: 1 })
      );
      expect(calls).toContainEqual({
        args: [expect.objectContaining({ state: 'pending' })],
        method: 'update',
        table: 'outbox_events'
      });
    } finally {
      logInfo.mockRestore();
    }
  });
});

describe('construccion del despachador', () => {
  const base = { SUPABASE_URL: 'https://proyecto.supabase.co', SUPABASE_SECRET_KEY: 'clave' };

  it('sin direccion o sin secreto no hay despachador', () => {
    expect(createTapNotificationWorker({ ...base })).toBeNull();
    expect(
      createTapNotificationWorker({ ...base, N8N_AGENT_WEBHOOK_URL: 'https://n8n.example.test/w' })
    ).toBeNull();
    expect(createTapNotificationWorker({ ...base, N8N_AGENT_AUTH_SECRET: 'secreto' })).toBeNull();
    expect(
      createTapNotificationWorker({
        ...base,
        N8N_AGENT_AUTH_SECRET: '   ',
        N8N_AGENT_WEBHOOK_URL: 'https://n8n.example.test/w'
      })
    ).toBeNull();
  });

  it('con las dos se construye', () => {
    expect(
      createTapNotificationWorker({
        ...base,
        N8N_AGENT_AUTH_SECRET: 'secreto',
        N8N_AGENT_WEBHOOK_URL: 'https://n8n.example.test/w'
      })
    ).toBeInstanceOf(TapNotificationWorker);
  });
});
