import { describe, expect, it } from 'vitest';
import { normalizeInboundMessage, providerMessageReference } from './zernio-inbound-normalizer';

/**
 * El payload real de un toque, recortado: llego asi desde Zernio el 2026-10-08 a las 18:57.
 */
const tapPayload = {
  account: { id: 'account-1', platform: 'whatsapp', username: '+52 1 427 192 0078' },
  conversation: { id: 'conversation-1' },
  event: 'message.received',
  message: {
    id: 'message-2',
    platform: 'whatsapp',
    sender: { id: 'sender-1', name: 'Y M B' },
    text: 'Asistiré'
  },
  metadata: {
    buttonPayload: 'Asistiré',
    quotedMessage: {
      messageId: 'message-1',
      platformMessageId: 'wamid.plantilla-48h'
    },
    quotedMessageId: 'wamid.plantilla-48h'
  },
  timestamp: '2026-10-08T18:57:29.122Z'
};

describe('toque de boton de plantilla', () => {
  it('reconoce el toque y con que mensaje nuestro responde', () => {
    expect(normalizeInboundMessage(tapPayload).buttonTap).toEqual({
      payload: 'Asistiré',
      quotedMessageReference: providerMessageReference('account-1', 'wamid.plantilla-48h')
    });
  });

  it('un texto escrito a mano no es un toque, aunque diga lo mismo', () => {
    const sinBoton = {
      ...tapPayload,
      metadata: { quotedMessage: { platformMessageId: 'wamid.plantilla-48h' } }
    };
    expect(normalizeInboundMessage(sinBoton).buttonTap).toBeNull();
  });

  it('sin mensaje citado no hay a que responder, asi que tampoco es un toque', () => {
    const sinCitado = { ...tapPayload, metadata: { buttonPayload: 'Asistiré' } };
    expect(normalizeInboundMessage(sinCitado).buttonTap).toBeNull();
  });

  it('un contenido vacio o de solo espacios no cuenta', () => {
    for (const buttonPayload of ['', '   ', null]) {
      expect(
        normalizeInboundMessage({
          ...tapPayload,
          metadata: { ...tapPayload.metadata, buttonPayload }
        }).buttonTap
      ).toBeNull();
    }
  });

  it('sin metadatos el mensaje se lee igual y no se pierde', () => {
    const sinMetadata = {
      account: tapPayload.account,
      conversation: tapPayload.conversation,
      event: tapPayload.event,
      message: tapPayload.message,
      timestamp: tapPayload.timestamp
    };
    const normalizado = normalizeInboundMessage(sinMetadata);
    expect(normalizado.body).toBe('Asistiré');
    expect(normalizado.buttonTap).toBeNull();
  });

  it('la referencia del citado no depende del texto que pulso el cliente', () => {
    const otroTexto = {
      ...tapPayload,
      metadata: { ...tapPayload.metadata, buttonPayload: 'No Asistiré' },
      message: { ...tapPayload.message, text: 'No Asistiré' }
    };
    // Dos botones distintos del MISMO mensaje comparten referencia: lo que cambia es el contenido.
    expect(normalizeInboundMessage(otroTexto).buttonTap).toMatchObject({
      payload: 'No Asistiré',
      quotedMessageReference: normalizeInboundMessage(tapPayload).buttonTap?.quotedMessageReference
    });
  });

  it('un texto de boton larguisimo se recorta al limite en lugar de romper el mensaje', () => {
    const larguisimo = {
      ...tapPayload,
      metadata: { ...tapPayload.metadata, buttonPayload: 'a'.repeat(500) }
    };
    // El esquema del payload acota a 200: lo que no cabe no convierte el toque en un mensaje perdido.
    expect(normalizeInboundMessage(larguisimo).buttonTap).toBeNull();
    expect(normalizeInboundMessage(larguisimo).body).toBe('Asistiré');
  });
});
