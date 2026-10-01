import { describe, expect, it } from 'vitest';
import {
  applyInboundMessage,
  clampReadMark,
  handoffToHuman,
  needsAttention,
  nextReadMark
} from './conversations';

describe('conversation policies', () => {
  it.each(['open', 'pending'] as const)('keeps %s status on inbound message', (status) => {
    expect(applyInboundMessage(status)).toBe(status);
  });

  it('reopens a resolved conversation on inbound message', () => {
    expect(applyInboundMessage('resolved')).toBe('open');
  });

  it('pauses automation when transferring to a human', () => {
    expect(handoffToHuman()).toBe('paused');
  });
});

describe('read mark clamping', () => {
  const newest = '2026-09-28T20:18:57.250Z';

  it('keeps a mark older than the newest message', () => {
    expect(clampReadMark('2026-09-28T19:00:00.000Z', newest)).toBe('2026-09-28T19:00:00.000Z');
  });

  it('caps a mark beyond the newest message, so a client cannot silence the future', () => {
    expect(clampReadMark('2030-01-01T00:00:00.000Z', newest)).toBe(newest);
  });

  it('keeps an exact mark', () => {
    expect(clampReadMark(newest, newest)).toBe(newest);
  });

  it('has no mark to clamp when the conversation has no messages', () => {
    expect(clampReadMark(newest, null)).toBeNull();
  });

  it.each([
    ['instante invalido', 'ayer', newest],
    ['referencia invalida', newest, 'ayer'],
    ['referencia vacia', newest, '']
  ])('refuses to invent a mark with an %s', (_case, candidate, reference) => {
    expect(clampReadMark(candidate, reference)).toBeNull();
  });
});

describe('read mark advance', () => {
  const current = '2026-09-28T20:00:00.000Z';

  it('advances when there is no previous mark', () => {
    expect(nextReadMark(null, current)).toEqual({ advance: true, mark: current });
  });

  it('advances with a later instant', () => {
    const later = '2026-09-28T20:30:00.000Z';
    expect(nextReadMark(current, later)).toEqual({ advance: true, mark: later });
  });

  it('holds with an earlier instant', () => {
    const earlier = '2026-09-28T19:00:00.000Z';
    expect(nextReadMark(current, earlier)).toEqual({ advance: false, mark: current });
  });

  it('holds on repetition, so the command is idempotent', () => {
    expect(nextReadMark(current, current)).toEqual({ advance: false, mark: current });
  });

  it('holds with an unusable instant instead of moving the mark', () => {
    expect(nextReadMark(current, 'ayer')).toEqual({ advance: false, mark: current });
  });

  it('adopts a valid instant when the stored mark is unusable', () => {
    expect(nextReadMark('ayer', current)).toEqual({ advance: true, mark: current });
  });
});

describe('conversation attention', () => {
  const mark = '2026-09-28T20:00:00.000Z';

  it('requires attention when an inbound message is newer than the mark', () => {
    expect(needsAttention(mark, '2026-09-28T20:05:00.000Z')).toBe(true);
  });

  it('does not require attention when the inbound message is older than the mark', () => {
    expect(needsAttention(mark, '2026-09-28T19:00:00.000Z')).toBe(false);
  });

  it('does not require attention when the inbound message matches the mark', () => {
    expect(needsAttention(mark, mark)).toBe(false);
  });

  it('requires attention when there is no mark yet', () => {
    expect(needsAttention(null, '2026-09-28T19:00:00.000Z')).toBe(true);
  });

  it('does not require attention for a conversation without inbound messages', () => {
    expect(needsAttention(mark, null)).toBe(false);
    expect(needsAttention(null, null)).toBe(false);
  });

  it('never requires attention from unusable data', () => {
    expect(needsAttention(mark, 'ayer')).toBe(false);
    expect(needsAttention(mark, '')).toBe(false);
  });
});
