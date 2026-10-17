import { describe, expect, it } from 'vitest';
import {
  formatOperationalDateTime,
  formatOperationalDayLabel,
  formatOperationalTime,
  operationalDayKey
} from './operational-time';

describe('hora operativa de Ciudad de México', () => {
  const midnightBoundary = '2026-10-17T05:30:00.000Z';

  it('calcula el día en Ciudad de México y no en la zona del navegador', () => {
    expect(operationalDayKey(midnightBoundary)).toBe('2026-10-16');
  });

  it('muestra la hora mexicana para el mismo instante a todos los agentes', () => {
    expect(formatOperationalTime('2026-10-17T08:53:00.000Z')).toContain('02:53');
    expect(formatOperationalDateTime(midnightBoundary)).toContain('16 oct');
  });

  it('etiqueta hoy y ayer usando el día operativo, incluso cerca de medianoche', () => {
    const now = new Date('2026-10-17T06:30:00.000Z');
    expect(formatOperationalDayLabel('2026-10-17T05:30:00.000Z', now)).toBe('Ayer');
    expect(formatOperationalDayLabel('2026-10-17T06:30:00.000Z', now)).toBe('Hoy');
  });
});
