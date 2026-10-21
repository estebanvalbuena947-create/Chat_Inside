import { ATTENTION_THRESHOLDS } from './conversations';
import { BUSINESS_TIME_ZONE, dayKeyInZone } from './reservation-values';

export type WeeklyShift = { day: number; start: number; end: number };
export type ScheduleVersion = {
  userId: string;
  effectiveAt: string;
  shifts: WeeklyShift[];
};
const operationalFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});
const DAY = 86400000;
const WEEK_MINUTES = 7 * 1440;

/** Minutes are local wall-clock minutes; an end before the start finishes the next day. */
export function validWeeklyShifts(shifts: WeeklyShift[]): boolean {
  const occupied = new Set<number>();
  for (const shift of shifts) {
    if (
      ![shift.day, shift.start, shift.end].every(Number.isInteger) ||
      shift.day < 0 ||
      shift.day > 6 ||
      shift.start < 0 ||
      shift.start >= 1440 ||
      shift.end < 0 ||
      shift.end > 1440 ||
      shift.start === shift.end
    )
      return false;
    const duration =
      shift.end > shift.start ? shift.end - shift.start : 1440 - shift.start + shift.end;
    for (let minute = 0; minute < duration; minute++) {
      const key = (shift.day * 1440 + shift.start + minute) % WEEK_MINUTES;
      if (occupied.has(key)) return false;
      occupied.add(key);
    }
  }
  return true;
}

/** Convert a local calendar date/time using the declared IANA zone, independent of process TZ. */
export function operationalInstant(day: string, minute = 0, timeZone = BUSINESS_TIME_ZONE): number {
  const wall = Date.parse(`${day}T00:00:00Z`) + minute * 60000;
  let instant = wall;
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = (
      timeZone === BUSINESS_TIME_ZONE
        ? operationalFormatter
        : new Intl.DateTimeFormat('en-CA', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23'
          })
    ).formatToParts(instant);
    const part = (key: string) => Number(parts.find((p) => p.type === key)?.value);
    const observed = Date.UTC(
      part('year'),
      part('month') - 1,
      part('day'),
      part('hour'),
      part('minute'),
      part('second')
    );
    const corrected = instant + wall - observed;
    if (corrected === instant) return instant;
    instant = corrected;
  }
  return instant;
}

export function shiftCalendarDay(day: string, amount: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + amount * DAY).toISOString().slice(0, 10);
}

/** Compile the union once per report; querying each wait must not rebuild every weekly schedule. */
function coverageCalculator(start: number, end: number, versions: ScheduleVersion[]) {
  const first = Math.min(...versions.map((v) => Date.parse(v.effectiveAt)));
  if (!versions.length || end < first) return (_start: number, _end: number): number | null => null;
  const byUser = new Map<string, ScheduleVersion[]>();
  for (const version of versions) {
    if (!validWeeklyShifts(version.shifts) || !Number.isFinite(Date.parse(version.effectiveAt)))
      throw new Error('Horario inválido.');
    byUser.set(version.userId, [...(byUser.get(version.userId) ?? []), version]);
  }
  const intervals: Array<[number, number]> = [];
  const firstDay = shiftCalendarDay(dayKeyInZone(new Date(Math.max(start, first)))!, -1);
  const lastDay = dayKeyInZone(new Date(end))!;
  for (const history of byUser.values()) {
    history.sort((a, b) => Date.parse(a.effectiveAt) - Date.parse(b.effectiveAt));
    for (let i = 0; i < history.length; i++) {
      const version = history[i];
      const from = Math.max(start, Date.parse(version.effectiveAt));
      const until = Math.min(end, history[i + 1] ? Date.parse(history[i + 1].effectiveAt) : end);
      if (until <= from) continue;
      for (let day = firstDay; day <= lastDay; day = shiftCalendarDay(day, 1)) {
        const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
        for (const shift of version.shifts.filter((s) => s.day === weekday)) {
          const a = Math.max(from, operationalInstant(day, shift.start));
          const finishDay = shift.end <= shift.start ? shiftCalendarDay(day, 1) : day;
          const b = Math.min(until, operationalInstant(finishDay, shift.end));
          if (b > a) intervals.push([a, b]);
        }
      }
    }
  }
  intervals.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [a, b] of intervals) {
    const previous = merged[merged.length - 1];
    if (previous && a <= previous[1]) previous[1] = Math.max(previous[1], b);
    else merged.push([a, b]);
  }
  const prefix = [0];
  for (const [a, b] of merged) prefix.push(prefix[prefix.length - 1] + b - a);
  const before = (instant: number) => {
    let lo = 0,
      hi = merged.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (merged[mid][1] <= instant) lo = mid + 1;
      else hi = mid;
    }
    return prefix[lo] + (lo < merged.length ? Math.max(0, instant - merged[lo][0]) : 0);
  };
  return (from: number, until: number): number | null =>
    from < first ? null : Math.round((before(until) - before(from)) / 1000);
}

/** Null means the wait precedes declared history, never zero by default. */
export function workingSeconds(
  start: number,
  end: number,
  versions: ScheduleVersion[]
): number | null {
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    throw new Error('Intervalo inválido.');
  return coverageCalculator(start, end, versions)(start, end);
}

export type ResponseEvent = {
  conversationId: string;
  createdAt: string;
  direction: string;
  senderType: string;
};
export type ResponseMeasurement = {
  conversationId: string;
  inboundAt: string;
  respondedAt: string;
  elapsedSeconds: number;
  seconds: number;
  basis: 'working' | 'elapsed';
  bucket: 'under' | 'between' | 'over';
};

/** Preserve the existing last-inbound pairing; bot replies never finish a human wait. */
export function measureResponses(
  rows: ResponseEvent[],
  since: string,
  versions: ScheduleVersion[] = []
): ResponseMeasurement[] {
  const grouped = new Map<string, ResponseEvent[]>();
  for (const row of rows) {
    const list = grouped.get(row.conversationId);
    if (list) list.push(row);
    else grouped.set(row.conversationId, [row]);
  }
  if (!rows.length) return [];
  const instants = rows.map((row) => Date.parse(row.createdAt)).filter(Number.isFinite);
  if (!instants.length) return [];
  const calculate = coverageCalculator(Math.min(...instants), Math.max(...instants), versions);
  const result: ResponseMeasurement[] = [];
  for (const [conversationId, list] of grouped) {
    list.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    let inbound: ResponseEvent | null = null;
    for (const row of list) {
      if (!Number.isFinite(Date.parse(row.createdAt))) continue;
      if (row.direction === 'inbound') {
        inbound = row;
        continue;
      }
      if (
        row.direction !== 'outbound' ||
        row.senderType !== 'agent' ||
        !inbound ||
        Date.parse(row.createdAt) < Date.parse(since)
      )
        continue;
      const elapsedSeconds = Math.max(
        0,
        Math.round((Date.parse(row.createdAt) - Date.parse(inbound.createdAt)) / 1000)
      );
      const working = calculate(Date.parse(inbound.createdAt), Date.parse(row.createdAt));
      const seconds = working ?? elapsedSeconds;
      result.push({
        conversationId,
        inboundAt: inbound.createdAt,
        respondedAt: row.createdAt,
        elapsedSeconds,
        seconds,
        basis: working === null ? 'elapsed' : 'working',
        bucket:
          seconds < ATTENTION_THRESHOLDS.amberSeconds
            ? 'under'
            : seconds <= ATTENTION_THRESHOLDS.redSeconds
              ? 'between'
              : 'over'
      });
      break;
    }
  }
  return result.sort(
    (a, b) => b.seconds - a.seconds || a.conversationId.localeCompare(b.conversationId)
  );
}
