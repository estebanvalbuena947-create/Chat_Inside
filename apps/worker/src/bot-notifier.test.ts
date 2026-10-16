import { describe, expect, it, vi } from 'vitest';
import {
  buildInboundNotification,
  claimDelivery,
  reclaimAbandonedBotDeliveries,
  sendPendingBotDeliveries,
  shouldRetryBotDelivery
} from './bot-notifier';

const base = {
  conversation: {
    accountId: 'cuenta-zernio-1',
    channelName: 'Inside Spa',
    contactName: 'Ana',
    contactUsername: 'ana.ig',
    hasComment: false,
    hasDm: true,
    id: 'conv-1',
    platform: 'instagram',
    status: 'open'
  },
  message: {
    body: 'Hola, quiero una cita',
    direction: 'inbound',
    id: 'msg-1',
    senderType: 'contact',
    sentAt: '2026-10-05T17:00:00.000Z',
    source: 'dm'
  },
  tenantId: 'tenant-1'
};

describe('aviso al bot', () => {
  it('describe el evento con los identificadores que n8n necesita', () => {
    const aviso = buildInboundNotification(base);
    expect(aviso.event).toBe('message.inbound');
    expect(aviso.messageId).toBe('msg-1');
    expect(aviso.conversationId).toBe('conv-1');
    expect(aviso.tenantId).toBe('tenant-1');
    expect(aviso.message.body).toBe('Hola, quiero una cita');
  });

  /**
   * El canal por el que entro el mensaje.
   *
   * n8n decide por cuenta: dos cuentas de la misma plataforma se distinguen por este identificador y
   * no por `platform` ni por `channelName`, que pueden repetirse. El valor es el de Zernio
   * (`account.accountId` de su webhook, guardado como `channel_accounts.provider_account_id`), no el
   * identificador local del canal ni el de la conversacion: por eso la prueba comprueba los tres y
   * exige que sean distintos entre si.
   */
  it('identifica la cuenta de Zernio que origino el mensaje', () => {
    const aviso = buildInboundNotification(base);
    expect(aviso.conversation.accountId).toBe('cuenta-zernio-1');
    expect(aviso.conversation.accountId).not.toBe(aviso.conversationId);
    expect(aviso.conversation.accountId).not.toBe(aviso.messageId);
  });

  it('incluye el contexto de la conversacion, que es lo que el bot necesita para decidir', () => {
    const aviso = buildInboundNotification(base);
    expect(aviso.conversation.contactName).toBe('Ana');
    expect(aviso.conversation.platform).toBe('instagram');
    expect(aviso.conversation.hasDm).toBe(true);
    expect(aviso.conversation.hasComment).toBe(false);
  });

  it('no inventa datos que no existen: los deja nulos', () => {
    const aviso = buildInboundNotification({
      conversation: { id: 'conv-2', status: 'open' },
      message: { body: 'Hola', direction: 'inbound', id: 'msg-2', senderType: 'contact' },
      tenantId: 'tenant-1'
    });
    expect(aviso.conversation.accountId).toBeNull();
    expect(aviso.conversation.contactName).toBeNull();
    expect(aviso.conversation.platform).toBeNull();
    expect(aviso.message.sentAt).toBeNull();
    expect(aviso.message.source).toBe('dm');
    // Un mensaje sin archivos viaja con la lista vacia, no sin el campo: el flujo que lo lee no
    // tiene que distinguir "no hay adjuntos" de "el aviso es viejo".
    expect(aviso.message.attachments).toEqual([]);
  });

  it('los adjuntos viajan con su tipo y su enlace, en el orden del mensaje', () => {
    const aviso = buildInboundNotification({
      ...base,
      message: {
        ...base.message,
        attachments: [
          {
            contentType: 'image/jpeg',
            id: 'adj-1',
            kind: 'image',
            title: null,
            url: 'https://almacen/comprobante-1.jpg'
          },
          {
            contentType: 'application/pdf',
            id: 'adj-2',
            kind: 'file',
            title: null,
            url: 'https://almacen/comprobante-2.pdf'
          }
        ]
      }
    });

    expect(aviso.message.attachments).toHaveLength(2);
    expect(aviso.message.attachments[0]).toMatchObject({ id: 'adj-1', kind: 'image' });
    expect(aviso.message.attachments[1]).toMatchObject({
      contentType: 'application/pdf',
      kind: 'file'
    });
  });

  it('un adjunto que todavia no esta copiado viaja con enlace nulo, sin perder el aviso', () => {
    const aviso = buildInboundNotification({
      ...base,
      message: {
        ...base.message,
        attachments: [{ contentType: null, id: 'adj-3', kind: 'file', title: null, url: null }]
      }
    });

    expect(aviso.message.attachments[0]?.url).toBeNull();
    expect(aviso.message.body).toBe('Hola, quiero una cita');
  });

  it('reintenta mientras queden intentos y se rinde al agotarlos', () => {
    expect(shouldRetryBotDelivery(0)).toBe(true);
    expect(shouldRetryBotDelivery(4)).toBe(true);
    expect(shouldRetryBotDelivery(5)).toBe(false);
  });
});

/**
 * El reclamo de la fila antes de entregarla.
 *
 * Es lo que impide que el mismo aviso salga dos veces. El sintoma que lo destapo: un audio disparo
 * dos veces el webhook de n8n, porque la fila seguia pendiente mientras el aviso viajaba y un ciclo
 * solapado la volvio a tomar. En la base no se notaba -- los dos ciclos escribian el mismo numero de
 * intentos--, asi que la prueba comprueba el reclamo en si, no su rastro.
 */
describe('reclamo del aviso', () => {
  function doble(respuesta: unknown) {
    const maybeSingle = vi.fn().mockResolvedValue(respuesta);
    const cadena: Record<string, unknown> = {
      eq: () => cadena,
      is: () => cadena,
      maybeSingle,
      select: () => cadena,
      update: () => cadena
    };
    const supabase = { from: vi.fn(() => cadena) } as unknown as Parameters<
      typeof claimDelivery
    >[0];
    return { maybeSingle, supabase };
  }

  it('toma la fila pendiente y devuelve el intento que le toca', async () => {
    const { maybeSingle, supabase } = doble({ data: { id: 'delivery-1' }, error: null });

    const intento = await claimDelivery(supabase, {
      attempts: 0,
      conversation_id: 'conv-1',
      id: 'delivery-1',
      message_id: 'msg-1',
      tenant_id: 'tenant-1'
    });

    expect(intento).toBe(1);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
    // El intento se cuenta al reclamar, no al terminar: asi el presupuesto cubre tambien el que se
    // quedo a medias si el proceso muere.
    const parche = (supabase.from as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    expect(parche).toBeGreaterThan(0);
  });

  it('si otro ciclo se adelanto, no entrega nada', async () => {
    const { supabase } = doble({ data: null, error: null });

    const intento = await claimDelivery(supabase, {
      attempts: 0,
      conversation_id: 'conv-1',
      id: 'delivery-1',
      message_id: 'msg-1',
      tenant_id: 'tenant-1'
    });

    expect(intento).toBeNull();
  });

  it('un reclamo abandonado vuelve a la cola: perder el aviso no es aceptable', async () => {
    const filas = [{ id: 'delivery-1' }, { id: 'delivery-2' }];
    const cadena: Record<string, unknown> = {
      eq: () => cadena,
      lt: () => cadena,
      select: () => Promise.resolve({ data: filas, error: null }),
      update: () => cadena
    };
    const supabase = { from: vi.fn(() => cadena) } as unknown as Parameters<
      typeof reclaimAbandonedBotDeliveries
    >[0];

    expect(await reclaimAbandonedBotDeliveries(supabase)).toBe(2);
  });
});

/**
 * El recorrido completo del aviso.
 *
 * El constructor del aviso puede estar bien y el dato perderse antes, al leer la conversacion: la
 * cuenta vive en `channel_accounts`, no en `conversations`, asi que una consulta que no la pida deja
 * el aviso sin canal sin que nada falle. Esta prueba recorre `sendPendingBotDeliveries` y comprueba
 * lo que de verdad sale hacia n8n.
 */
describe('entrega del aviso al bot', () => {
  /**
   * Un doble de Supabase con la forma justa para este recorrido.
   *
   * `bot_deliveries` responde dos cosas distintas: la lista de pendientes (al esperar la consulta) y
   * el reclamo de una fila (en `maybeSingle`). Las demas tablas devuelven su fila en `maybeSingle` y
   * una lista en la espera, que es como las usa el notificador.
   */
  function stubSupabase() {
    const cadenas: Record<string, Record<string, unknown>> = {};
    for (const tabla of ['bot_integrations', 'conversations', 'message_attachments', 'messages']) {
      cadenas[tabla] = {
        eq: () => cadenas[tabla],
        is: () => cadenas[tabla],
        limit: () => cadenas[tabla],
        lt: () => cadenas[tabla],
        maybeSingle: async () => respuestas[tabla] ?? { data: null, error: null },
        order: () => cadenas[tabla],
        select: () => cadenas[tabla],
        then: (resolver: (valor: unknown) => unknown) =>
          Promise.resolve(respuestas[tabla] ?? { data: null, error: null }).then(resolver),
        update: () => cadenas[tabla]
      };
    }

    const pendientes = [
      {
        attempts: 0,
        conversation_id: 'conv-1',
        id: 'delivery-1',
        message_id: 'msg-1',
        tenant_id: 'tenant-1'
      }
    ];

    cadenas.bot_deliveries = {
      eq: () => cadenas.bot_deliveries,
      is: () => cadenas.bot_deliveries,
      limit: () => cadenas.bot_deliveries,
      lt: () => cadenas.bot_deliveries,
      maybeSingle: async () => ({ data: { id: 'delivery-1' }, error: null }),
      order: () => cadenas.bot_deliveries,
      select: () => cadenas.bot_deliveries,
      then: (resolver: (valor: unknown) => unknown) =>
        Promise.resolve({ data: pendientes, error: null }).then(resolver),
      update: () => cadenas.bot_deliveries
    };

    return {
      from: (tabla: string) => cadenas[tabla]
    } as unknown as Parameters<typeof sendPendingBotDeliveries>[0]['supabase'];
  }

  const respuestas: Record<string, unknown> = {
    bot_integrations: {
      data: { enabled: true, webhook_url: 'https://n8n.example.test/webhook/inbox' },
      error: null
    },
    conversations: {
      data: {
        channel_account: {
          display_name: 'Inside Spa',
          platform: 'instagram',
          provider_account_id: '6a6cfdc3df17280d93506a96'
        },
        contact: { display_name: 'Ana', external_username: 'ana.ig' },
        has_comment: false,
        has_dm: true,
        id: 'conv-1',
        status: 'open'
      },
      error: null
    },
    message_attachments: { data: [], error: null },
    messages: {
      data: {
        body: 'Hola, quiero una cita',
        comment_state: null,
        direction: 'inbound',
        id: 'msg-1',
        sender_type: 'contact',
        sent_at: '2026-10-16T14:51:59.149Z',
        source: 'dm'
      },
      error: null
    }
  };

  it('entrega el aviso con la cuenta de Zernio que lo origino', async () => {
    const entregas: Array<{ url: string; body: Record<string, unknown> }> = [];

    const resultados = await sendPendingBotDeliveries({
      deliver: async (url, body) => {
        entregas.push({ body: body as unknown as Record<string, unknown>, url });
      },
      supabase: stubSupabase()
    });

    expect(resultados).toEqual([{ kind: 'sent', messageId: 'msg-1' }]);
    expect(entregas).toHaveLength(1);
    expect(entregas[0]?.url).toBe('https://n8n.example.test/webhook/inbox');
    expect(entregas[0]?.body).toMatchObject({
      conversation: { accountId: '6a6cfdc3df17280d93506a96', platform: 'instagram' },
      conversationId: 'conv-1',
      event: 'message.inbound',
      messageId: 'msg-1',
      tenantId: 'tenant-1'
    });
  });
});
