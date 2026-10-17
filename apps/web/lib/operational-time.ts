/**
 * La operación se coordina desde Ciudad de México. La zona se declara en cada formateo para que
 * el resultado no dependa de la configuración del navegador del agente.
 */
export const OPERATIONAL_TIME_ZONE = 'America/Mexico_City';
const OPERATIONAL_LOCALE = 'es-MX';

function validDate(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(OPERATIONAL_LOCALE, {
    ...options,
    timeZone: OPERATIONAL_TIME_ZONE
  });
}

export function operationalDayKey(value: string | Date): string | null {
  const date = validDate(value);
  if (!date) return null;

  const parts = formatter({ year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(
    date
  );
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  const year = part('year');
  const month = part('month');
  const day = part('day');
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function formatOperationalTime(value: string | Date): string {
  const date = validDate(value);
  return date ? formatter({ hour: '2-digit', minute: '2-digit' }).format(date) : '';
}

export function formatOperationalDate(value: string | Date): string {
  const date = validDate(value);
  return date ? formatter({ dateStyle: 'medium' }).format(date) : '';
}

export function formatOperationalDateTime(value: string | Date): string {
  const date = validDate(value);
  return date ? formatter({ dateStyle: 'medium', timeStyle: 'short' }).format(date) : '';
}

export function formatOperationalShortDate(value: string | Date): string {
  const date = validDate(value);
  return date ? formatter({ day: '2-digit', month: 'short', year: 'numeric' }).format(date) : '';
}

export function formatOperationalDayLabel(value: string | Date, now: Date = new Date()): string {
  const dayKey = operationalDayKey(value);
  if (!dayKey) return '';
  const todayKey = operationalDayKey(now);
  const yesterdayKey = operationalDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  if (dayKey === todayKey) return 'Hoy';
  if (dayKey === yesterdayKey) return 'Ayer';
  return formatOperationalDate(value);
}
