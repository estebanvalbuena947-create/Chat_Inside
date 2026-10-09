import { describe, expect, it } from 'vitest';
import { buildInboundNotification, shouldRetryBotDelivery } from './bot-notifier';

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
