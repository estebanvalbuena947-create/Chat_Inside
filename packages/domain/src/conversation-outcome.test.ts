import { describe, expect, it } from 'vitest';
import {
  OUTCOME_RECORDED_BY,
  shouldApplyWonOutcome,
  validateWonOutcome,
  type WonOutcome
} from './conversation-outcome.js';

const AHORA = new Date('2026-10-01T15:00:00.000Z');

function hechoPersona(extra: Partial<Parameters<typeof validateWonOutcome>[0]> = {}) {
  return {
    amount: 1500,
    currency: 'MXN',
    recordedBy: OUTCOME_RECORDED_BY.person,
    recordedAt: AHORA,
    recordedByUserId: 'usuario-1',
    ...extra
  };
}

function hechoBot(extra: Partial<Parameters<typeof validateWonOutcome>[0]> = {}) {
  return {
    amount: 1500,
    currency: 'MXN',
    recordedBy: OUTCOME_RECORDED_BY.bot,
    recordedAt: AHORA,
    sourceReference: 'pago-123',
    ...extra
  };
}

function ganado(extra: Partial<WonOutcome> = {}): WonOutcome {
  return {
    outcome: 'ganado',
    amount: 1500,
    currency: 'MXN',
    recordedBy: OUTCOME_RECORDED_BY.person,
    recordedAt: AHORA,
    recordedByUserId: 'usuario-1',
    sourceReference: null,
    ...extra
  };
}

describe('validar el hecho ganado', () => {
  it('acepta un hecho registrado por una persona con su valor total', () => {
    const r = validateWonOutcome(hechoPersona());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.outcome).toBe('ganado');
      expect(r.value.amount).toBe(1500);
      expect(r.value.currency).toBe('MXN');
    }
  });

  it('acepta un hecho registrado por el bot con la referencia del pago', () => {
    const r = validateWonOutcome(hechoBot());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.recordedBy).toBe('bot');
      expect(r.value.sourceReference).toBe('pago-123');
      expect(r.value.recordedByUserId).toBeNull();
    }
  });

  it('acepta importe cero, porque una cortesia tambien es un negocio ganado', () => {
    expect(validateWonOutcome(hechoPersona({ amount: 0 })).ok).toBe(true);
  });

  it('acepta el importe maximo que admite la base', () => {
    expect(validateWonOutcome(hechoPersona({ amount: 9999999999.99 })).ok).toBe(true);
  });

  it('rechaza un importe negativo', () => {
    expect(validateWonOutcome(hechoPersona({ amount: -1 })).ok).toBe(false);
  });

  it('rechaza un importe con mas de dos decimales en vez de redondearlo en silencio', () => {
    expect(validateWonOutcome(hechoPersona({ amount: 19.999 })).ok).toBe(false);
  });

  it('rechaza un importe no finito', () => {
    expect(validateWonOutcome(hechoPersona({ amount: Number.NaN })).ok).toBe(false);
    expect(validateWonOutcome(hechoPersona({ amount: Number.POSITIVE_INFINITY })).ok).toBe(false);
  });

  it('rechaza un importe mayor que el que admite la base', () => {
    expect(validateWonOutcome(hechoPersona({ amount: 10000000000 })).ok).toBe(false);
  });

  it('rechaza una moneda que no sea un codigo ISO de tres letras mayusculas', () => {
    expect(validateWonOutcome(hechoPersona({ currency: 'mxn' })).ok).toBe(false);
    expect(validateWonOutcome(hechoPersona({ currency: 'MX' })).ok).toBe(false);
    expect(validateWonOutcome(hechoPersona({ currency: 'MXNN' })).ok).toBe(false);
  });

  it('rechaza un origen distinto de persona o bot', () => {
    expect(validateWonOutcome(hechoPersona({ recordedBy: 'sistema' as never })).ok).toBe(false);
  });

  it('rechaza una fecha invalida', () => {
    expect(validateWonOutcome(hechoPersona({ recordedAt: new Date('nada') })).ok).toBe(false);
  });

  it('exige saber quien cuando lo registra una persona', () => {
    expect(validateWonOutcome(hechoPersona({ recordedByUserId: '   ' })).ok).toBe(false);
  });

  it('exige la referencia del pago cuando lo registra el bot, para poder no duplicarlo', () => {
    expect(validateWonOutcome(hechoBot({ sourceReference: null })).ok).toBe(false);
    expect(validateWonOutcome(hechoBot({ sourceReference: '  ' })).ok).toBe(false);
  });
});

describe('decidir si el hecho entrante cambia algo', () => {
  it('aplica el hecho cuando no habia ninguno', () => {
    expect(shouldApplyWonOutcome(null, ganado())).toBe(true);
  });

  it('no vuelve a aplicar el mismo pago detectado dos veces por el bot', () => {
    const previo = ganado({ recordedBy: 'bot', sourceReference: 'pago-123' });
    const entrante = ganado({ recordedBy: 'bot', sourceReference: 'pago-123' });
    expect(shouldApplyWonOutcome(previo, entrante)).toBe(false);
  });

  it('si aplica cuando el mismo pago llega con otro importe, porque es una correccion', () => {
    const previo = ganado({ recordedBy: 'bot', sourceReference: 'pago-123', amount: 1500 });
    const entrante = ganado({ recordedBy: 'bot', sourceReference: 'pago-123', amount: 1800 });
    expect(shouldApplyWonOutcome(previo, entrante)).toBe(true);
  });

  it('no repite la escritura si una persona vuelve a marcar el mismo importe', () => {
    expect(shouldApplyWonOutcome(ganado(), ganado())).toBe(false);
  });

  it('si aplica si una persona cambia el importe', () => {
    expect(shouldApplyWonOutcome(ganado(), ganado({ amount: 2000 }))).toBe(true);
  });

  it('distingue importes iguales en monedas distintas', () => {
    expect(shouldApplyWonOutcome(ganado(), ganado({ currency: 'USD' }))).toBe(true);
  });
});
