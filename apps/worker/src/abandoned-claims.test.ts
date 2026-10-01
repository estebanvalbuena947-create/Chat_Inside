import { describe, expect, it } from 'vitest';
import {
  ABANDONED_CLAIM_MS,
  RECLAIM_INTERVAL_MS,
  abandonedBefore,
  isReclaimDue
} from './abandoned-claims';

describe('abandoned claims', () => {
  it('considers a claim abandoned only beyond the threshold', () => {
    const now = Date.parse('2026-09-28T21:00:00.000Z');
    expect(abandonedBefore(now)).toBe(new Date(now - ABANDONED_CLAIM_MS).toISOString());
  });

  it('uses a threshold long enough to not reclaim work in progress', () => {
    expect(ABANDONED_CLAIM_MS).toBeGreaterThan(RECLAIM_INTERVAL_MS);
  });

  it('is due on the first cycle', () => {
    expect(isReclaimDue(0, Date.parse('2026-09-28T21:00:00.000Z'))).toBe(true);
  });

  it('is not due again inside the interval', () => {
    const now = Date.parse('2026-09-28T21:00:00.000Z');
    expect(isReclaimDue(now, now + RECLAIM_INTERVAL_MS - 1)).toBe(false);
  });

  it('is due exactly at the interval boundary, so a stalled loop recovers', () => {
    const now = Date.parse('2026-09-28T21:00:00.000Z');
    expect(isReclaimDue(now, now + RECLAIM_INTERVAL_MS)).toBe(true);
  });
});
