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
      } as never,
      {} as never
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
      { create: () => ({ from: create }) } as never,
      {} as never
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

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const conversationId = '33333333-3333-4333-8333-333333333333';
const channelAccountId = '55555555-5555-4555-8555-555555555555';
const messageId = '44444444-4444-4444-8444-444444444444';
const idempotencyKey = '66666666-6666-4666-8666-666666666666';

function createEnqueueFake(options: {
  conversation?: unknown;
  existing?: unknown;
  inserted?: (row: Record<string, unknown>) => { data: unknown; error: unknown };
  ultimoEntrante?: string | null;
}) {
  const insertados: Array<Record<string, unknown>> = [];
  const client = {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      const eqs: unknown[][] = [];
      for (const method of ['limit', 'order', 'select']) builder[method] = () => builder;
      builder.eq = (...args: unknown[]) => {
        eqs.push(args);
        return builder;
      };
      if (table !== 'conversations') {
        builder.insert = (row: Record<string, unknown>) => {
          insertados.push(row);
          const insertBuilder: Record<string, unknown> = {};
          insertBuilder.select = () => insertBuilder;
          insertBuilder.maybeSingle = async () =>
            options.inserted?.(row) ?? { data: null, error: null };
          return insertBuilder;
        };
      }
      builder.maybeSingle = async () => {
        if (table === 'conversations') return { data: options.conversation ?? null, error: null };
        // La misma tabla responde a dos preguntas distintas: la ventana filtra por `direction` y la
        // idempotencia por su clave. Distinguirlas evita que un doble comodo esconda el error que
        // estas pruebas buscan.
        const preguntaPorEntrante = eqs.some(([campo]) => campo === 'direction');
        if (preguntaPorEntrante) {
          return {
            data: options.ultimoEntrante ? { created_at: options.ultimoEntrante } : null,
            error: null
          };
        }
        return { data: options.existing ?? null, error: null };
      };
      return builder;
    }
  };
  return { client, insertados };
}

function createService(options: {
  catalog: unknown;
  conversation?: unknown;
  existing?: unknown;
  inserted?: (row: Record<string, unknown>) => { data: unknown; error: unknown };
  ultimoEntrante?: string | null;
}) {
  const fake = createEnqueueFake(options);
  const service = new TenantMessageService(
    { authenticate: async () => ({ userId }) } as never,
    { assertMembership: async () => undefined } as never,
    { create: () => fake.client } as never,
    options.catalog as never
  );
  return { insertados: fake.insertados, service };
}

const plantillaAprobada = {
  category: 'UTILITY',
  language: 'es_MX',
  name: 'notificacion_48h',
  previewText: 'Hola, confirmamos tu reservacion.',
  status: 'APPROVED',
  variables: []
};

function catalogFake(templates: unknown[]) {
  return {
    readForChannelAccount: vi.fn(async () => ({ channelAccountId, templates }))
  };
}

function conversationRow(plataforma = 'whatsapp') {
  return {
    channel_account: { platform: plataforma, provider: 'zernio' },
    channel_account_id: channelAccountId,
    id: conversationId
  };
}

describe('TenantMessageService ventana de WhatsApp', () => {
  const hace = (horas: number) => new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();

  /** La fila que devuelve la base al insertar: sin ella, el servicio no tiene nada que responder. */
  const insertada = () => ({
    data: {
      attachments: [],
      body: 'Hola',
      created_at: '2026-10-09T00:00:00+00',
      direction: 'outbound',
      id: messageId,
      sender_type: 'agent',
      sent_at: '2026-10-09T00:00:00+00',
      source: 'dm',
      status: 'queued',
      whatsapp_template_language: null,
      whatsapp_template_name: null
    },
    error: null
  });

  it('no deja escribir texto si la ventana esta cerrada, y no encola nada', async () => {
    const { insertados, service } = createService({
      catalog: catalogFake([]),
      conversation: conversationRow(),
      ultimoEntrante: hace(25)
    });

    await expect(
      service.createOutbound('Bearer valid.jwt', tenantId, conversationId, {
        body: 'Hola',
        idempotencyKey,
        kind: 'text'
      })
    ).rejects.toThrow(/ventana de 24 horas de WhatsApp está cerrada/);
    expect(insertados).toHaveLength(0);
  });

  it('con la ventana abierta el texto sale como siempre', async () => {
    const { insertados, service } = createService({
      catalog: catalogFake([]),
      conversation: conversationRow(),
      inserted: insertada,
      ultimoEntrante: hace(1)
    });

    await service.createOutbound('Bearer valid.jwt', tenantId, conversationId, {
      body: 'Hola',
      idempotencyKey,
      kind: 'text'
    });
    expect(insertados).toHaveLength(1);
  });

  it('la plantilla si sale con la ventana cerrada: es justo para eso', async () => {
    const { insertados, service } = createService({
      catalog: catalogFake([plantillaAprobada]),
      conversation: conversationRow(),
      inserted: insertada,
      ultimoEntrante: hace(48)
    });

    await service.createOutbound('Bearer valid.jwt', tenantId, conversationId, {
      idempotencyKey,
      kind: 'whatsapp_template',
      whatsappTemplate: { language: 'es_MX', name: 'notificacion_48h' }
    });
    expect(insertados).toHaveLength(1);
  });

  it('sin entrantes registrados no se inventa una ventana cerrada', async () => {
    const { insertados, service } = createService({
      catalog: catalogFake([]),
      conversation: conversationRow(),
      inserted: insertada,
      ultimoEntrante: null
    });

    await service.createOutbound('Bearer valid.jwt', tenantId, conversationId, {
      body: 'Hola',
      idempotencyKey,
      kind: 'text'
    });
    expect(insertados).toHaveLength(1);
  });

  it('en un canal que no es WhatsApp la ventana no interviene', async () => {
    const { insertados, service } = createService({
      catalog: catalogFake([]),
      conversation: conversationRow('instagram'),
      inserted: insertada,
      ultimoEntrante: hace(72)
    });

    await service.createOutbound('Bearer valid.jwt', tenantId, conversationId, {
      body: 'Hola',
      idempotencyKey,
      kind: 'text'
    });
    expect(insertados).toHaveLength(1);
  });
});

describe('TenantMessageService envio con plantilla', () => {
  it('encola la plantilla aprobada de la cuenta con su copia visible y su referencia', async () => {
    const catalog = catalogFake([plantillaAprobada]);
    const { insertados, service } = createService({
      catalog,
      conversation: conversationRow(),
      inserted: () => ({
        data: {
          attachments: [],
          body: plantillaAprobada.previewText,
          created_at: '2026-10-09T00:00:00+00',
          direction: 'outbound',
          id: messageId,
          sender_type: 'agent',
          sent_at: '2026-10-09T00:00:00+00',
          source: 'dm',
          status: 'queued',
          whatsapp_template_language: 'es_MX',
          whatsapp_template_name: 'notificacion_48h'
        },
        error: null
      })
    });

    const resultado = await service.createOutbound('Bearer valid.jwt', tenantId, conversationId, {
      idempotencyKey,
      kind: 'whatsapp_template',
      whatsappTemplate: { language: 'es_MX', name: 'notificacion_48h' }
    });

    expect(catalog.readForChannelAccount).toHaveBeenCalledWith(tenantId, channelAccountId);
    // El texto guardado es la copia visible; la referencia es lo que se despacha.
    expect(insertados[0]).toMatchObject({
      body: plantillaAprobada.previewText,
      whatsapp_template_language: 'es_MX',
      whatsapp_template_name: 'notificacion_48h'
    });
    expect(resultado.item.whatsappTemplate).toEqual({
      language: 'es_MX',
      name: 'notificacion_48h'
    });
  });

  it('rechaza una plantilla que no esta en el catalogo de esa cuenta y no encola nada', async () => {
    const { insertados, service } = createService({
      catalog: catalogFake([]),
      conversation: conversationRow()
    });

    await expect(
      service.createOutbound('Bearer valid.jwt', tenantId, conversationId, {
        idempotencyKey,
        kind: 'whatsapp_template',
        whatsappTemplate: { language: 'es_MX', name: 'notificacion_48h' }
      })
    ).rejects.toThrow(
      'Esa plantilla no está aprobada en la cuenta de WhatsApp de esta conversación.'
    );
    expect(insertados).toHaveLength(0);
  });

  it('un canal retirado no envia, ni texto ni plantilla', async () => {
    // La fila del canal se conserva (la historia la referencia), pero su cuenta ya no esta conectada:
    // encolar seria un mensaje condenado.
    const canalRetirado = {
      channel_account: { disconnected_at: '2026-10-08T20:00:00.000Z', provider: 'zernio' },
      channel_account_id: channelAccountId,
      id: conversationId
    };

    for (const command of [
      { body: 'Hola', idempotencyKey, kind: 'text' as const },
      {
        idempotencyKey,
        kind: 'whatsapp_template' as const,
        whatsappTemplate: { language: 'es_MX', name: 'notificacion_48h' }
      }
    ]) {
      const { insertados, service } = createService({
        catalog: catalogFake([plantillaAprobada]),
        conversation: canalRetirado
      });

      await expect(
        service.createOutbound('Bearer valid.jwt', tenantId, conversationId, command)
      ).rejects.toThrow('El canal de esta conversación está retirado');
      expect(insertados).toHaveLength(0);
    }
  });

  it('rechaza una plantilla con huecos, en cualquier componente', async () => {
    const { insertados, service } = createService({
      catalog: catalogFake([{ ...plantillaAprobada, variables: ['{{1}}', '{{nombre}}'] }]),
      conversation: conversationRow()
    });

    await expect(
      service.createOutbound('Bearer valid.jwt', tenantId, conversationId, {
        idempotencyKey,
        kind: 'whatsapp_template',
        whatsappTemplate: { language: 'es_MX', name: 'notificacion_48h' }
      })
    ).rejects.toThrow('Esa plantilla necesita valores para {{1}}, {{nombre}}');
    expect(insertados).toHaveLength(0);
  });

  it('rechaza una plantilla que Meta no tiene aprobada', async () => {
    const { insertados, service } = createService({
      catalog: catalogFake([{ ...plantillaAprobada, status: 'PENDING' }]),
      conversation: conversationRow()
    });

    await expect(
      service.createOutbound('Bearer valid.jwt', tenantId, conversationId, {
        idempotencyKey,
        kind: 'whatsapp_template',
        whatsappTemplate: { language: 'es_MX', name: 'notificacion_48h' }
      })
    ).rejects.toThrow('Meta todavía no tiene aprobada esa plantilla.');
    expect(insertados).toHaveLength(0);
  });

  it('una conversacion sin cuenta de WhatsApp de este espacio no envia plantilla', async () => {
    const catalog = {
      readForChannelAccount: vi.fn(async () => null)
    };
    const { service } = createService({ catalog, conversation: conversationRow() });

    await expect(
      service.createOutbound('Bearer valid.jwt', tenantId, conversationId, {
        idempotencyKey,
        kind: 'whatsapp_template',
        whatsappTemplate: { language: 'es_MX', name: 'notificacion_48h' }
      })
    ).rejects.toThrow('La conversación no tiene una cuenta de WhatsApp lista para enviar.');
  });

  it('la misma clave con otra plantilla es un conflicto', async () => {
    const catalog = catalogFake([plantillaAprobada]);
    const { insertados, service } = createService({
      catalog,
      conversation: conversationRow(),
      existing: {
        body: 'otra cosa',
        conversation_id: conversationId,
        direction: 'outbound',
        id: messageId,
        sender_type: 'agent',
        sent_at: null,
        source: 'dm',
        status: 'queued',
        whatsapp_template_language: 'es_MX',
        whatsapp_template_name: 'otra_plantilla'
      }
    });

    await expect(
      service.createOutbound('Bearer valid.jwt', tenantId, conversationId, {
        idempotencyKey,
        kind: 'whatsapp_template',
        whatsappTemplate: { language: 'es_MX', name: 'notificacion_48h' }
      })
    ).rejects.toThrow('La clave de idempotencia ya fue usada para otro mensaje.');
    expect(insertados).toHaveLength(0);
  });

  it('repetir la misma clave con la misma plantilla devuelve lo guardado sin ir al proveedor', async () => {
    const catalog = catalogFake([plantillaAprobada]);
    const { service } = createService({
      catalog,
      conversation: conversationRow(),
      existing: {
        body: plantillaAprobada.previewText,
        conversation_id: conversationId,
        created_at: '2026-10-09T00:00:00+00',
        direction: 'outbound',
        id: messageId,
        sender_type: 'agent',
        sent_at: null,
        source: 'dm',
        status: 'queued',
        whatsapp_template_language: 'es_MX',
        whatsapp_template_name: 'notificacion_48h'
      }
    });

    const resultado = await service.createOutbound('Bearer valid.jwt', tenantId, conversationId, {
      idempotencyKey,
      kind: 'whatsapp_template',
      whatsappTemplate: { language: 'es_MX', name: 'notificacion_48h' }
    });

    expect(resultado.item.id).toBe(messageId);
    expect(catalog.readForChannelAccount).not.toHaveBeenCalled();
  });
});
