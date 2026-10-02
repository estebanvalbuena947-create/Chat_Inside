import { describe, expect, it } from 'vitest';
import { buildWonConversionEvent, wonConversionEventId } from './conversion-event';

const base = {
  amount: 1500,
  contact: { email: 'Cliente@Ejemplo.com', phoneE164: '+5215512345678', platformUserId: 'psid-1' },
  conversationId: 'conv-1',
  currency: 'MXN',
  includeContactData: false,
  occurredAt: '2026-10-02T15:30:00.000Z',
  tenantId: 'tenant-1'
};

describe('evento de conversion de una conversacion ganada', () => {
  it('usa el identificador de plataforma siempre', () => {
    const r = buildWonConversionEvent(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.event.user.externalId).toBe('psid-1');
      expect(r.value.event.eventName).toBe('Purchase');
      expect(r.value.event.actionSource).toBe('crm');
      expect(r.value.event.value).toBe(1500);
      expect(r.value.event.currency).toBe('MXN');
    }
  });

  it('no envia correo ni telefono cuando el interruptor esta apagado', () => {
    const r = buildWonConversionEvent(base);
    if (r.ok) {
      expect(r.value.event.user.email).toBeUndefined();
      expect(r.value.event.user.phone).toBeUndefined();
    }
  });

  it('los envia cuando el interruptor esta encendido', () => {
    const r = buildWonConversionEvent({ ...base, includeContactData: true });
    if (r.ok) {
      expect(r.value.event.user.email).toBe('Cliente@Ejemplo.com');
      expect(r.value.event.user.phone).toBe('+5215512345678');
    }
  });

  it('convierte el instante a segundos unix, que es lo que exige Meta', () => {
    const r = buildWonConversionEvent(base);
    if (r.ok) {
      expect(r.value.event.eventTime).toBe(
        Math.floor(Date.parse('2026-10-02T15:30:00.000Z') / 1000)
      );
      expect(String(r.value.event.eventTime).length).toBe(10);
    }
  });

  it('da la misma clave al mismo negocio, para que Meta no cuente dos veces', () => {
    const primera = buildWonConversionEvent(base);
    const segunda = buildWonConversionEvent({ ...base, amount: 1800 });
    if (primera.ok && segunda.ok) {
      expect(primera.value.eventId).toBe(segunda.value.eventId);
      expect(primera.value.eventId).toBe(wonConversionEventId('tenant-1', 'conv-1'));
    }
  });

  it('rechaza la conversion sin ningun identificador del cliente', () => {
    const r = buildWonConversionEvent({
      ...base,
      contact: { email: null, phoneE164: null, platformUserId: null }
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('identificador');
  });

  it('rechaza un importe invalido', () => {
    expect(buildWonConversionEvent({ ...base, amount: -1 }).ok).toBe(false);
    expect(buildWonConversionEvent({ ...base, amount: Number.NaN }).ok).toBe(false);
  });

  it('rechaza una fecha invalida', () => {
    expect(buildWonConversionEvent({ ...base, occurredAt: 'ayer' }).ok).toBe(false);
  });

  it('acepta un valor cero, porque una cortesia tambien cierra negocio', () => {
    expect(buildWonConversionEvent({ ...base, amount: 0 }).ok).toBe(true);
  });
});
