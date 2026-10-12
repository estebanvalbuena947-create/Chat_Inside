import { describe, expect, it, vi } from 'vitest';
import {
  buildInboundNotification,
  claimDelivery,
  reclaimAbandonedBotDeliveries,
  shouldRetryBotDelivery
} from './bot-notifier';

const base = {
  conversation: {
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
