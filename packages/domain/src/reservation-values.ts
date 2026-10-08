/* Traduccion de los valores crudos del proyecto de reservas.
 *
 * Viene de `js/core.js` del dashboard que el equipo usa hoy, y se conserva **tal cual**: cada rama
 * de aqui existe porque la base escribe ese caso. «Simplificarlas» cambiaria lo que el equipo ve.
 *
 * Solo lo que hace falta en el servidor: el formato de presentacion y lo que toca el navegador se
 * quedan en la interfaz.
 */

/** Zona horaria del negocio. Un pago confirmado a la 01:00 en Ciudad de Mexico cuenta como ese dia. */
export const BUSINESS_TIME_ZONE = 'America/Mexico_City';

/**
 * Convierte montos que llegan como numero, texto ("$1,200.00"), texto con separadores locales o
 * valores vacios. Devuelve 0 cuando no es numerico, para que las sumas nunca produzcan NaN.
 */
export function toAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;

  let text = String(value).trim();
  if (!text) return 0;

  const negative = /^\(.*\)$/.test(text) || text.startsWith('-');
  text = text.replace(/[^\d.,]/g, '');
  if (!text) return 0;

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // El ultimo separador es el decimal; el otro es de miles.
    text = lastComma > lastDot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (lastComma > -1) {
    // "1,200" son miles · "1200,50" es decimal.
    text = /,\d{2}$/.test(text) ? text.replace(',', '.') : text.replace(/,/g, '');
  }

  const parsed = Number.parseFloat(text);
  if (!Number.isFinite(parsed)) return 0;
  return negative ? -parsed : parsed;
}

/**
 * Normaliza fechas de Supabase, Postgres y n8n: ISO con zona, "2026-09-21 14:30:00",
 * "2026-09-21T14:30:00" o epoch (segundos o milisegundos).
 */
export function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const fromEpoch = new Date(value < 1e12 ? value * 1000 : value);
    return Number.isNaN(fromEpoch.getTime()) ? null : fromEpoch;
  }

  const text = String(value).trim();
  if (!text) return null;

  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) return direct;

  // "2026-09-21 14:30:00" y "+00" sin minutos no los entiende el interprete: se arreglan aqui.
  const normalized = text.replace(' ', 'T').replace(/(\.\d+)?([+-]\d{2})$/, '$1$2:00');
  const retry = new Date(normalized);
  return Number.isNaN(retry.getTime()) ? null : retry;
}

/** Une valores y devuelve el primero con contenido. La base deja el mismo dato en columnas distintas. */
export function firstValue<T>(...values: Array<T | null | undefined>): T | null {
  return (
    values.find((value) => value !== null && value !== undefined && String(value).trim() !== '') ??
    null
  );
}

/** Lee la primera propiedad existente de una fila. */
export function pick<T extends Record<string, unknown>>(row: T | null, ...keys: string[]): unknown {
  if (!row) return null;
  for (const key of keys) {
    const value = row[key];
    if (value !== null && value !== undefined && String(value).trim() !== '') return value;
  }
  return null;
}

/**
 * Clave YYYY-MM-DD en la zona indicada.
 *
 * Evita el desfase de `toISOString` y el de la zona de quien mira: si un pago se confirma el 23 a la
 * 01:00 en Ciudad de Mexico, cuenta como el 23 aunque quien revise este en otra zona horaria.
 */
export function dayKeyInZone(value: unknown, timeZone: string = BUSINESS_TIME_ZONE): string | null {
  if (typeof value === 'string') {
    const plain = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (plain) return `${plain[1]}-${plain[2]}-${plain[3]}`;
  }

  const date = parseDate(value);
  if (!date) return null;

  try {
    return new Intl.DateTimeFormat('en-CA', {
      day: '2-digit',
      month: '2-digit',
      timeZone,
      year: 'numeric'
    }).format(date);
  } catch {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }
}

export function todayKey(timeZone: string = BUSINESS_TIME_ZONE): string | null {
  return dayKeyInZone(new Date(), timeZone);
}
