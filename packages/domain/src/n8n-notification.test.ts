import { describe, expect, it } from 'vitest';
import { parseWhatsappButtonTapNotification } from './n8n-notification';
import { tieneFormaDeUuid, uuidDesdeHash } from './identifiers';

const aviso = {
  buttonPayload: 'Asistiré',
  contactId: '33333333-3333-4333-8333-333333333333',
  conversationId: '44444444-4444-4444-8444-444444444444',
  event: 'whatsapp.button_tap',
  messageId: '55555555-5555-4555-8555-555555555555',
  occurredAt: '2026-10-08T18:57:29.122Z',
  template: { language: 'es_MX', name: 'notificacion_48h' }
};

describe('aviso de toque a n8n', () => {
  it('acepta el contrato pactado', () => {
    expect(parseWhatsappButtonTapNotification(aviso)).toEqual(aviso);
  });

  it('rechaza cualquier campo de mas: los datos personales no salen ni por descuido', () => {
    for (const extra of [
      { phoneNumber: '+573102453646' },
      { contactName: 'Y M B' },
      { body: 'Hola' },
      { email: 'cliente@example.test' }
    ]) {
      expect(() => parseWhatsappButtonTapNotification({ ...aviso, ...extra })).toThrow();
    }
  });

  it('exige las dos mitades de la referencia de la plantilla', () => {
    expect(() =>
      parseWhatsappButtonTapNotification({ ...aviso, template: { name: 'notificacion_48h' } })
    ).toThrow();
    expect(() =>
      parseWhatsappButtonTapNotification({ ...aviso, template: { language: 'es_MX', name: '' } })
    ).toThrow();
  });

  it('un toque sin contenido, o con otro evento, no es un aviso valido', () => {
    expect(() => parseWhatsappButtonTapNotification({ ...aviso, buttonPayload: '   ' })).toThrow();
    expect(() => parseWhatsappButtonTapNotification({ ...aviso, event: 'otra.cosa' })).toThrow();
  });

  it('los identificadores tienen que ser internos validos y la fecha ser una fecha', () => {
    expect(() =>
      parseWhatsappButtonTapNotification({ ...aviso, conversationId: 'conv-1' })
    ).toThrow();
    expect(() => parseWhatsappButtonTapNotification({ ...aviso, occurredAt: 'ayer' })).toThrow();
  });
});

describe('forma del uuid derivado', () => {
  it('da forma valida a cualquier hash y es determinista', () => {
    const hash = 'a'.repeat(64);
    const primero = uuidDesdeHash(hash);
    expect(primero).toBe(uuidDesdeHash(hash));
    expect(tieneFormaDeUuid(primero)).toBe(true);
  });

  it('hashes distintos dan uuid distintos', () => {
    expect(uuidDesdeHash('a'.repeat(64))).not.toBe(uuidDesdeHash('b'.repeat(64)));
  });

  it('no acepta como uuid cualquier cadena con guiones', () => {
    expect(tieneFormaDeUuid('no-es-un-uuid')).toBe(false);
    expect(tieneFormaDeUuid(null)).toBe(false);
    expect(tieneFormaDeUuid('11111111-1111-1111-1111-111111111111')).toBe(false);
  });
});
