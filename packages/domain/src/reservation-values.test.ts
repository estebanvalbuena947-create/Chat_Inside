import { describe, expect, it } from 'vitest';
import {
  dayKeyInZone,
  firstValue,
  parseDate,
  pick,
  toAmount,
  todayKey
} from './reservation-values';

describe('montos de la base de reservas', () => {
  it('entiende los numeros tal cual', () => {
    expect(toAmount(1200)).toBe(1200);
    expect(toAmount(0)).toBe(0);
    expect(toAmount(Number.NaN)).toBe(0);
    expect(toAmount(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('entiende el texto con simbolo y separadores de miles', () => {
    expect(toAmount('$1,200.00')).toBe(1200);
    expect(toAmount('1,200')).toBe(1200);
    expect(toAmount('$ 1,200')).toBe(1200);
  });

  it('distingue la coma decimal de la de miles', () => {
    // "1200,50" es decimal; "1.200,50" tambien, con el punto de miles.
    expect(toAmount('1200,50')).toBe(1200.5);
    expect(toAmount('1.200,50')).toBe(1200.5);
  });

  it('reconoce un negativo, que es como se escribe un ajuste', () => {
    expect(toAmount('(500)')).toBe(-500);
    expect(toAmount('-500')).toBe(-500);
  });

  it('nunca devuelve NaN: lo que no es un monto vale cero', () => {
    expect(toAmount('')).toBe(0);
    expect(toAmount('   ')).toBe(0);
    expect(toAmount(null)).toBe(0);
    expect(toAmount(undefined)).toBe(0);
    expect(toAmount('pendiente')).toBe(0);
    expect(toAmount({ monto: 100 })).toBe(0);
  });
});

describe('fechas de la base de reservas', () => {
  it('entiende ISO con zona', () => {
    expect(parseDate('2026-09-21T14:30:00.000Z')?.toISOString()).toBe('2026-09-21T14:30:00.000Z');
  });

  it('entiende la fecha de Postgres con espacio en vez de T', () => {
    const fecha = parseDate('2026-09-21 14:30:00');
    expect(fecha).not.toBeNull();
    expect(Number.isNaN((fecha as Date).getTime())).toBe(false);
  });

  it('entiende una zona escrita sin minutos, como la deja n8n', () => {
    expect(parseDate('2026-09-21T14:30:00+00')?.toISOString()).toBe('2026-09-21T14:30:00.000Z');
  });

  it('entiende epoch en segundos y en milisegundos', () => {
    const segundos = parseDate(1_790_000_000);
    const milisegundos = parseDate(1_790_000_000_000);
    expect(segundos?.getTime()).toBe(1_790_000_000_000);
    expect(milisegundos?.getTime()).toBe(1_790_000_000_000);
  });

  it('no inventa una fecha cuando no la hay', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('ayer')).toBeNull();
    expect(parseDate(new Date('no-es-fecha'))).toBeNull();
  });
});

describe('el mismo dato en columnas distintas', () => {
  it('toma el primero con contenido y salta los vacios', () => {
    expect(firstValue(null, '  ', undefined, 'Cliente', 'Otro')).toBe('Cliente');
    expect(firstValue(null, '', '   ')).toBeNull();
    // El cero es un valor con contenido: no es lo mismo que un hueco.
    expect(firstValue<number | string>(0, 'despues')).toBe(0);
  });

  it('lee la primera propiedad existente de una fila', () => {
    const fila = { actualizado_at: '  ', nombre: 'Cliente', cliente: 'Otro' };
    expect(pick(fila, 'actualizado_at', 'nombre', 'cliente')).toBe('Cliente');
    expect(pick(fila, 'no_existe')).toBeNull();
    expect(pick(null, 'nombre')).toBeNull();
  });
});

describe('el dia del negocio', () => {
  it('cuenta el dia en la zona del spa, no en la de quien mira', () => {
    // 02:00 UTC del 23 son las 20:00 del 22 en Ciudad de Mexico.
    expect(dayKeyInZone('2026-09-23T02:00:00.000Z', 'America/Mexico_City')).toBe('2026-09-22');
    expect(dayKeyInZone('2026-09-23T02:00:00.000Z', 'UTC')).toBe('2026-09-23');
  });

  it('con un pago de madrugada, cuenta el dia que el equipo ve', () => {
    // 07:00 UTC del 23 son la 01:00 del 23 en Ciudad de Mexico.
    expect(dayKeyInZone('2026-09-23T07:00:00.000Z', 'America/Mexico_City')).toBe('2026-09-23');
  });

  it('acepta una fecha sin hora tal cual', () => {
    expect(dayKeyInZone('2026-09-23', 'UTC')).toBe('2026-09-23');
  });

  it('devuelve nulo cuando no hay fecha, en lugar de hoy', () => {
    expect(dayKeyInZone('', 'UTC')).toBeNull();
    expect(dayKeyInZone('ayer', 'UTC')).toBeNull();
  });

  it('hoy es una fecha con la forma esperada', () => {
    expect(todayKey('UTC')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
