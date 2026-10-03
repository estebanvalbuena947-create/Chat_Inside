import { describe, expect, it } from 'vitest';
import { conversionFailureReason, shouldRetryConversion, toUnixSeconds } from './conversion-sender';

describe('envio de conversiones', () => {
  it('trata un lote con fallos como fallo, aunque el codigo sea 200', () => {
    const motivo = conversionFailureReason({
      eventsFailed: 1,
      failures: [{ message: 'Invalid event_time' }]
    });
    expect(motivo).toBe('Invalid event_time');
  });

  it('no da motivo cuando Meta acepto el evento', () => {
    expect(conversionFailureReason({ eventsFailed: 0, failures: [] })).toBeNull();
  });

  it('da un motivo legible cuando Meta rechaza sin detallar', () => {
    expect(conversionFailureReason({ eventsFailed: 1, failures: [] })).toContain('sin detallar');
  });

  it('reintenta mientras queden intentos y deja de intentarlo al agotarlos', () => {
    expect(shouldRetryConversion(0)).toBe(true);
    expect(shouldRetryConversion(4)).toBe(true);
    expect(shouldRetryConversion(5)).toBe(false);
    expect(shouldRetryConversion(9)).toBe(false);
  });

  it('convierte el instante a segundos unix, no a milisegundos', () => {
    const segundos = toUnixSeconds('2026-10-02T15:30:00.000Z');
    expect(segundos).toBe(Math.floor(Date.parse('2026-10-02T15:30:00.000Z') / 1000));
    expect(String(segundos).length).toBe(10);
  });
});
