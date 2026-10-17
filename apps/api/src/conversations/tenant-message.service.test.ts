import { describe, expect, it, vi } from 'vitest';
import { TenantMessageService } from './tenant-message.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const conversationId = '44444444-4444-4444-8444-444444444444';
const channelAccountId = '55555555-5555-4555-8555-555555555555';
const messageId = '44444444-4444-4444-8444-444444444444';
const attachmentId = '77777777-7777-4777-8777-777777777777';
const idempotencyKey = '66666666-6666-4666-8666-666666666666';
const uploadId = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
const uploadPath = `${tenantId}/${conversationId}/${uploadId}.jpg`;

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
      {} as never,
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

  it('reads the most recent history page and returns it in chronological order', async () => {
    const newer = {
      body: 'El mensaje más reciente',
      created_at: '2026-08-13T00:02:00+00',
      direction: 'outbound',
      id: '55555555-5555-4555-8555-555555555555',
      sender_type: 'automation',
      sent_at: '2026-08-13T00:02:00+00',
      source: 'dm',
      status: 'sent'
    };
    const older = {
      body: 'El primer mensaje del bloque reciente',
      created_at: '2026-08-13T00:01:00+00',
      direction: 'inbound',
      id: '44444444-4444-4444-8444-444444444444',
      sender_type: 'contact',
      sent_at: '2026-08-13T00:01:00+00',
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
    const order = vi.fn(() => messagesQuery);
    const messagesQuery = {
      eq: () => messagesQuery,
      limit: async () => ({ data: [newer, older], error: null }),
      order,
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
      {} as never,
      {} as never
    );

    const result = await service.list(
      'Bearer valid.jwt',
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
      { limit: 100 }
    );

    expect(order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(result.items.map((message) => message.body)).toEqual([older.body, newer.body]);
  });

  /**
   * El historial firma cada adjunto contra SU bucket.
   *
   * Es el defecto que este corte cierra: el adjunto que el bot manda desde el catalogo de una sede
   * vive en `branch-media` y la carga de la asesora en `conversation-media`, y firmar los dos contra
   * el mismo bucket dejaba sin enlace -- «sin copia disponible» -- justo la foto que el bot acaba de
   * enviar.
   */
  it('firma cada adjunto del historial contra el bucket de su fila', async () => {
    const mensaje = {
      attachments: [
        {
          bucket: 'branch-media',
          content_type: 'image/jpeg',
          id: attachmentId,
          kind: 'image',
          source_title: null,
          storage_object_path: 'sede/valle/foto.jpg'
        },
        {
          bucket: 'conversation-media',
          content_type: 'application/pdf',
          id: '88888888-8888-4888-8888-888888888888',
          kind: 'file',
          source_title: null,
          storage_object_path: 'conv/archivo.pdf'
        }
      ],
      body: 'Con dos adjuntos',
      created_at: '2026-10-09T00:00:00+00',
      direction: 'outbound',
      id: messageId,
      sender_type: 'agent',
      sent_at: '2026-10-09T00:00:00+00',
      source: 'dm',
      status: 'sent'
    };
    const conversationQuery = {
      eq: () => conversationQuery,
      maybeSingle: async () => ({ data: { id: conversationId }, error: null }),
      select: () => conversationQuery
    };
    const messagesQuery = {
      eq: () => messagesQuery,
      limit: async () => ({ data: [mensaje], error: null }),
      order: () => messagesQuery,
      select: () => messagesQuery
    };
    const bucketsFirmados: string[] = [];
    const service = new TenantMessageService(
      { authenticate: async () => ({ userId }) } as never,
      { assertMembership: async () => undefined } as never,
      {
        create: () => ({
          from: (table: string) => (table === 'conversations' ? conversationQuery : messagesQuery),
          storage: {
            from: (bucket: string) => ({
              createSignedUrls: async (paths: string[]) => {
                bucketsFirmados.push(bucket);
                return {
                  data: paths.map((path) => ({
                    path,
                    signedUrl: `https://storage.test/${bucket}`
                  })),
                  error: null
                };
              }
            })
          }
        })
      } as never,
      {} as never,
      {} as never
    );

    const listado = await service.list('Bearer valid.jwt', tenantId, conversationId, { limit: 10 });

    expect(bucketsFirmados).toEqual(['branch-media', 'conversation-media']);
    expect(listado.items[0]?.attachments.map((adjunto) => adjunto.url)).toEqual([
      'https://storage.test/branch-media',
      'https://storage.test/conversation-media'
    ]);
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
      {} as never,
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

type FakeResponse = { data: unknown; error: unknown };

/**
 * El cliente de Supabase, con lo justo para observar el orden de las escrituras.
 *
 * Tres cosas que un doble comodo escondería y que estas pruebas necesitan ver:
 *   - cada tabla responde a lo que se le pregunta (la ventana filtra por `direction` y la
 *     idempotencia por su clave; confundirlas haria pasar la prueba del orden sin comprobar nada),
 *   - la cadena se puede esperar sin llamar a nada mas (`insert` y `delete` se esperan tal cual),
 *   - queda anotado en que orden se escribio el mensaje, su adjunto y su encolado, que es la regla
 *     que impide que el trabajador tome un mensaje al que todavia le falta el archivo.
 */
function createEnqueueFake(options: {
  attachmentsError?: unknown;
  conversation?: unknown;
  existing?: unknown;
  inserted?: (row: Record<string, unknown>) => FakeResponse;
  queued?: (row: Record<string, unknown>) => FakeResponse;
  signError?: unknown;
  ultimoEntrante?: string | null;
}) {
  const insertados: Array<Record<string, unknown>> = [];
  const adjuntosInsertados: Array<Record<string, unknown>> = [];
  const escrituras: string[] = [];
  const bucketsFirmados: string[] = [];
  const borrados: Array<{ eqs: unknown[][] }> = [];

  const client = {
    from: (tabla: string) => {
      const eqs: unknown[][] = [];
      let operacion = 'select';
      let fila: Record<string, unknown> | Record<string, unknown>[] | null = null;

      const respond = (): FakeResponse => {
        if (tabla === 'conversations') return { data: options.conversation ?? null, error: null };
        if (tabla === 'message_attachments') {
          if (operacion !== 'insert') return { data: null, error: null };
          const filas = Array.isArray(fila) ? fila : [fila];
          adjuntosInsertados.push(...(filas as Array<Record<string, unknown>>));
          escrituras.push('attachments');
          return { data: null, error: options.attachmentsError ?? null };
        }
        if (tabla !== 'messages') return { data: null, error: null };

        if (operacion === 'insert') {
          const row = fila as Record<string, unknown>;
          insertados.push(row);
          escrituras.push(row.status === 'draft' ? 'message:draft' : 'message:encolado');
          return options.inserted?.(row) ?? { data: null, error: null };
        }
        if (operacion === 'update') {
          // Se anota el INTENTO con el estado que se quiso escribir, no el exito.
          escrituras.push(`message:update:${String((fila as Record<string, unknown>).status)}`);
          return options.queued?.(fila as Record<string, unknown>) ?? { data: null, error: null };
        }
        if (operacion === 'delete') {
          escrituras.push('message:borrado');
          return { data: null, error: null };
        }

        // La misma tabla responde a dos preguntas distintas: la ventana filtra por `direction` y la
        // idempotencia por su clave, y lo que se busca por clave trae el adjunto guardado.
        const preguntaPorEntrante = eqs.some(([campo]) => campo === 'direction');
        if (preguntaPorEntrante) {
          return {
            data: options.ultimoEntrante ? { created_at: options.ultimoEntrante } : null,
            error: null
          };
        }
        return { data: options.existing ?? null, error: null };
      };

      const builder: Record<string, unknown> = {};
      for (const metodo of ['limit', 'order', 'select']) builder[metodo] = () => builder;
      builder.eq = (...args: unknown[]) => {
        eqs.push(args);
        return builder;
      };
      builder.insert = (row: Record<string, unknown> | Record<string, unknown>[]) => {
        operacion = 'insert';
        fila = row;
        return builder;
      };
      builder.update = (row: Record<string, unknown>) => {
        operacion = 'update';
        fila = row;
        return builder;
      };
      builder.delete = () => {
        operacion = 'delete';
        borrados.push({ eqs });
        return builder;
      };
      builder.maybeSingle = async () => respond();
      builder.then = (resolver: (valor: FakeResponse) => unknown) =>
        Promise.resolve(respond()).then(resolver);
      return builder;
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (paths: string[]) => {
          bucketsFirmados.push(bucket);
          if (options.signError) return { data: null, error: options.signError };
          return {
            data: paths.map((path) => ({
              path,
              signedUrl: `https://storage.test/${bucket}/${path}`
            })),
            error: null
          };
        }
      })
    }
  };
  return { adjuntosInsertados, borrados, bucketsFirmados, client, escrituras, insertados };
}

function createService(options: {
  attachmentsError?: unknown;
  catalog: unknown;
  conversation?: unknown;
  existing?: unknown;
  inserted?: (row: Record<string, unknown>) => FakeResponse;
  mediaExists?: boolean;
  queued?: (row: Record<string, unknown>) => FakeResponse;
  signError?: unknown;
  ultimoEntrante?: string | null;
}) {
  const fake = createEnqueueFake(options);
  const uploadedObjectExists = vi.fn(async () => options.mediaExists ?? true);
  const service = new TenantMessageService(
    { authenticate: async () => ({ userId }) } as never,
    { assertMembership: async () => undefined } as never,
    { create: () => fake.client } as never,
    options.catalog as never,
    { uploadedObjectExists } as never
  );
  return { ...fake, service, uploadedObjectExists };
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

/** La fila que devuelve la base al insertar un mensaje de solo texto. */
function insertada(estado = 'queued') {
  return {
    data: {
      attachments: [],
      body: 'Hola',
      created_at: '2026-10-09T00:00:00+00',
      direction: 'outbound',
      id: messageId,
      sender_type: 'agent',
      sent_at: '2026-10-09T00:00:00+00',
      source: 'dm',
      status: estado,
      whatsapp_template_language: null,
      whatsapp_template_name: null
    },
    error: null
  };
}

/** La fila que devuelve la base al pasar el mensaje a la cola, ya con su adjunto escrito. */
function encoladaConAdjunto(bucket = 'conversation-media', path = uploadPath) {
  return {
    data: {
      attachments: [
        {
          bucket,
          content_type: 'image/jpeg',
          id: attachmentId,
          kind: 'image',
          source_title: null,
          storage_object_path: path
        }
      ],
      body: 'Aqui tienes la foto',
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
  };
}

describe('TenantMessageService ventana de WhatsApp', () => {
  const hace = (horas: number) => new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();

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
      inserted: () => insertada(),
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
      inserted: () => insertada(),
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
      inserted: () => insertada(),
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
      inserted: () => insertada(),
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

/**
 * El envio con archivo.
 *
 * La regla que se comprueba aqui no es "se guarda una fila": es que el mensaje NACE COMPLETO. El
 * trabajador toma el mensaje cuando ve el evento de envio, y el evento nace cuando el mensaje queda
 * en cola; por eso el mensaje se inserta en `draft`, su adjunto se escribe despues y solo entonces
 * pasa a `queued`. Si el adjunto no se puede escribir, no queda nada: ni borrador ni cola.
 */
describe('TenantMessageService envio con archivo', () => {
  const comando = {
    body: 'Aqui tienes la foto',
    extension: 'jpg' as const,
    idempotencyKey,
    kind: 'media' as const,
    uploadId
  };

  /** Un archivo sin pie: el cuerpo vacio es un envio legitimo. */
  const comandoPdf = {
    body: '',
    extension: 'pdf' as const,
    idempotencyKey,
    kind: 'media' as const,
    uploadId
  };

  it('escribe el adjunto con su bucket y su procedencia y deja el mensaje en cola', async () => {
    const { adjuntosInsertados, insertados, service, uploadedObjectExists } = createService({
      catalog: catalogFake([]),
      conversation: conversationRow(),
      inserted: () => insertada('draft'),
      queued: () => encoladaConAdjunto()
    });

    const resultado = await service.createOutbound(
      'Bearer valid.jwt',
      tenantId,
      conversationId,
      comando
    );

    // La carga se comprueba contra el objeto y no contra lo que diga el comando.
    expect(uploadedObjectExists).toHaveBeenCalledWith(expect.anything(), {
      conversationId,
      extension: 'jpg',
      tenantId,
      uploadId
    });
    expect(insertados[0]).toMatchObject({ body: comando.body, status: 'draft' });
    expect(adjuntosInsertados).toEqual([
      {
        bucket: 'conversation-media',
        content_type: 'image/jpeg',
        conversation_id: conversationId,
        kind: 'image',
        message_id: messageId,
        ordinal: 0,
        source_kind: 'conversation_upload',
        storage_object_path: uploadPath,
        tenant_id: tenantId
      }
    ]);
    expect(resultado.item.status).toBe('queued');
    // El enlace viene firmado, contra el bucket de la fila, para poder mostrarlo en el acto.
    expect(resultado.item.attachments).toEqual([
      {
        contentType: 'image/jpeg',
        id: attachmentId,
        kind: 'image',
        title: null,
        url: `https://storage.test/conversation-media/${uploadPath}`
      }
    ]);
    // Y la respuesta no expone la ruta interna como dato: solo el enlace firmado, que es lo unico
    // que el navegador puede usar.
    expect(Object.keys(resultado.item.attachments[0]!).sort()).toEqual([
      'contentType',
      'id',
      'kind',
      'title',
      'url'
    ]);
    expect(resultado.item.attachments[0]?.url).not.toBe(uploadPath);
  });

  /**
   * La regla 5: mientras el mensaje no este en cola no puede haber evento.
   *
   * El evento lo crea el disparador al quedar en cola, asi que lo observable desde el caso de uso es
   * el ORDEN: el mensaje nace en `draft`, despues se escribe su adjunto y solo entonces se actualiza
   * a `queued`. Cualquier otro orden deja una ventana en la que el trabajador envia el mensaje sin su
   * archivo.
   */
  it('escribe el adjunto despues del mensaje y antes de encolarlo', async () => {
    const { escrituras, service } = createService({
      catalog: catalogFake([]),
      conversation: conversationRow(),
      inserted: () => insertada('draft'),
      queued: () => encoladaConAdjunto()
    });

    await service.createOutbound('Bearer valid.jwt', tenantId, conversationId, comando);

    expect(escrituras).toEqual(['message:draft', 'attachments', 'message:update:queued']);
  });

  it('si el adjunto no se puede escribir, el mensaje no queda ni en borrador ni en cola', async () => {
    const { adjuntosInsertados, borrados, escrituras, service } = createService({
      attachmentsError: { code: '23514', message: 'no' },
      catalog: catalogFake([]),
      conversation: conversationRow(),
      inserted: () => insertada('draft'),
      queued: () => encoladaConAdjunto()
    });

    await expect(
      service.createOutbound('Bearer valid.jwt', tenantId, conversationId, comando)
    ).rejects.toThrow('No fue posible guardar el archivo del mensaje.');

    // Se intento la fila, y el borrador se retiro: nada quedo a medias ni en la cola.
    expect(adjuntosInsertados).toHaveLength(1);
    expect(escrituras).toEqual(['message:draft', 'attachments', 'message:borrado']);
    expect(escrituras).not.toContain('message:update:queued');
    // El borrado solo alcanza a un mensaje en borrador: uno que ya llego a la cola no se toca.
    expect(borrados[0]?.eqs).toContainEqual(['status', 'draft']);
  });

  it('si el mensaje no se puede encolar, tampoco queda el borrador con su adjunto', async () => {
    const { borrados, escrituras, service } = createService({
      catalog: catalogFake([]),
      conversation: conversationRow(),
      inserted: () => insertada('draft'),
      queued: () => ({ data: null, error: { code: '08006', message: 'sin conexion' } })
    });

    await expect(
      service.createOutbound('Bearer valid.jwt', tenantId, conversationId, comando)
    ).rejects.toThrow('No fue posible encolar el mensaje con su archivo.');

    expect(escrituras).toEqual([
      'message:draft',
      'attachments',
      'message:update:queued',
      'message:borrado'
    ]);
    expect(borrados[0]?.eqs).toContainEqual(['status', 'draft']);
  });

  it('un envio de solo texto no gana ninguna fila de adjunto', async () => {
    const { adjuntosInsertados, escrituras, service } = createService({
      catalog: catalogFake([]),
      conversation: conversationRow(),
      inserted: () => insertada()
    });

    await service.createOutbound('Bearer valid.jwt', tenantId, conversationId, {
      body: 'Solo texto',
      idempotencyKey,
      kind: 'text'
    });

    expect(adjuntosInsertados).toHaveLength(0);
    // Sin adjunto la escritura es la de siempre: no hay borrador ni segunda escritura.
    expect(escrituras).toEqual(['message:encolado']);
  });

  it('un archivo que no esta en el almacen no encola nada', async () => {
    const { adjuntosInsertados, insertados, service } = createService({
      catalog: catalogFake([]),
      conversation: conversationRow(),
      mediaExists: false
    });

    await expect(
      service.createOutbound('Bearer valid.jwt', tenantId, conversationId, comando)
    ).rejects.toThrow('El archivo que quieres enviar ya no está disponible');

    expect(insertados).toHaveLength(0);
    expect(adjuntosInsertados).toHaveLength(0);
  });

  it('un documento a un canal que no lo admite se rechaza con su motivo, sin escribir nada', async () => {
    const { insertados, service, uploadedObjectExists } = createService({
      catalog: catalogFake([]),
      conversation: conversationRow('instagram')
    });

    await expect(
      service.createOutbound('Bearer valid.jwt', tenantId, conversationId, comandoPdf)
    ).rejects.toThrow(
      'Este canal solo admite imágenes y vídeos: el archivo elegido no se puede enviar.'
    );

    // El canal decide antes de mirar el almacen: no hay nada que comprobar.
    expect(uploadedObjectExists).not.toHaveBeenCalled();
    expect(insertados).toHaveLength(0);
  });

  it('el mismo documento si sale por WhatsApp, que si lo admite', async () => {
    const { adjuntosInsertados, service } = createService({
      catalog: catalogFake([]),
      conversation: conversationRow('whatsapp'),
      inserted: () => insertada('draft'),
      queued: () => encoladaConAdjunto('conversation-media', `${uploadId}.pdf`)
    });

    await service.createOutbound('Bearer valid.jwt', tenantId, conversationId, comandoPdf);

    expect(adjuntosInsertados[0]).toMatchObject({ kind: 'file', content_type: 'application/pdf' });
  });

  /**
   * La idempotencia con archivo.
   *
   * Repetir la clave tiene que devolver el MISMO mensaje, y la misma clave con otro archivo tiene que
   * ser un conflicto: si no, un reintento mandaria el archivo equivocado.
   */
  it('repetir la misma clave con el mismo archivo devuelve lo guardado, sin escribir de nuevo', async () => {
    const { adjuntosInsertados, insertados, service, uploadedObjectExists } = createService({
      catalog: catalogFake([]),
      conversation: conversationRow(),
      existing: {
        attachments: [
          {
            bucket: 'conversation-media',
            content_type: 'image/jpeg',
            id: attachmentId,
            kind: 'image',
            source_title: null,
            storage_object_path: uploadPath
          }
        ],
        body: comando.body,
        conversation_id: conversationId,
        created_at: '2026-10-09T00:00:00+00',
        direction: 'outbound',
        id: messageId,
        sender_type: 'agent',
        sent_at: '2026-10-09T00:00:00+00',
        source: 'dm',
        status: 'queued',
        whatsapp_template_language: null,
        whatsapp_template_name: null
      }
    });

    const resultado = await service.createOutbound(
      'Bearer valid.jwt',
      tenantId,
      conversationId,
      comando
    );

    expect(resultado.item.id).toBe(messageId);
    expect(resultado.item.attachments[0]?.url).toBe(
      `https://storage.test/conversation-media/${uploadPath}`
    );
    expect(insertados).toHaveLength(0);
    expect(adjuntosInsertados).toHaveLength(0);
    // Un reintento tardio no depende de que el objeto siga en el almacen.
    expect(uploadedObjectExists).not.toHaveBeenCalled();
  });

  it('la misma clave con otro archivo es un conflicto, no un mensaje con el archivo equivocado', async () => {
    const { adjuntosInsertados, insertados, service } = createService({
      catalog: catalogFake([]),
      conversation: conversationRow(),
      existing: {
        attachments: [
          {
            bucket: 'conversation-media',
            content_type: 'image/jpeg',
            id: attachmentId,
            kind: 'image',
            source_title: null,
            storage_object_path: `${tenantId}/${conversationId}/${'b'.repeat(64)}.jpg`
          }
        ],
        body: comando.body,
        conversation_id: conversationId,
        created_at: '2026-10-09T00:00:00+00',
        direction: 'outbound',
        id: messageId,
        sender_type: 'agent',
        sent_at: '2026-10-09T00:00:00+00',
        source: 'dm',
        status: 'queued',
        whatsapp_template_language: null,
        whatsapp_template_name: null
      }
    });

    await expect(
      service.createOutbound('Bearer valid.jwt', tenantId, conversationId, comando)
    ).rejects.toThrow('La clave de idempotencia ya fue usada para otro mensaje.');
    expect(insertados).toHaveLength(0);
    expect(adjuntosInsertados).toHaveLength(0);
  });

  it('la misma clave con el mismo texto pero sin archivo tampoco vale', async () => {
    const { service } = createService({
      catalog: catalogFake([]),
      conversation: conversationRow(),
      existing: {
        attachments: [
          {
            bucket: 'conversation-media',
            content_type: 'image/jpeg',
            id: attachmentId,
            kind: 'image',
            source_title: null,
            storage_object_path: uploadPath
          }
        ],
        body: 'Solo texto',
        conversation_id: conversationId,
        created_at: '2026-10-09T00:00:00+00',
        direction: 'outbound',
        id: messageId,
        sender_type: 'agent',
        sent_at: '2026-10-09T00:00:00+00',
        source: 'dm',
        status: 'queued',
        whatsapp_template_language: null,
        whatsapp_template_name: null
      }
    });

    await expect(
      service.createOutbound('Bearer valid.jwt', tenantId, conversationId, {
        body: 'Solo texto',
        idempotencyKey,
        kind: 'text'
      })
    ).rejects.toThrow('La clave de idempotencia ya fue usada para otro mensaje.');
  });
});
