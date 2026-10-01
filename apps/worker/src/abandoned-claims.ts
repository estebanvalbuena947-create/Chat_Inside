export const ABANDONED_CLAIM_MS = 5 * 60_000;
export const RECLAIM_INTERVAL_MS = 60_000;

/**
 * Un reclamo abandonado es trabajo marcado como en curso que nunca se cerro, porque el
 * proceso murio entre el reclamo y la confirmacion. Sin recuperacion ese trabajo no se
 * reintenta jamas: no se procesa, no se marca fallido y no se ve en ninguna parte.
 */
export function abandonedBefore(now: number): string {
  return new Date(now - ABANDONED_CLAIM_MS).toISOString();
}

export function isReclaimDue(lastReclaimAt: number, now: number): boolean {
  return now - lastReclaimAt >= RECLAIM_INTERVAL_MS;
}
