import { describe, expect, it } from 'vitest';
import {
  applyInboundMessage,
  ATTENTION_THRESHOLDS,
  attentionLevel,
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

describe('attention level: cuanto lleva el cliente sin respuesta', () => {
  const ahora = new Date('2026-10-07T20:00:00.000Z');
  const hace = (minutos: number) => new Date(ahora.getTime() - minutos * 60_000).toISOString();

  it('no hay nada pendiente cuando el ultimo mensaje es nuestro', () => {
    expect(
      attentionLevel({ direction: 'outbound', lastMessageAt: hace(1), now: ahora })
    ).toBeNull();
  });

  it('sin mensaje, o con una fecha ilegible, no inventa un nivel', () => {
    expect(attentionLevel({ direction: 'inbound', lastMessageAt: null, now: ahora })).toBeNull();
    expect(attentionLevel({ direction: 'inbound', lastMessageAt: 'ayer', now: ahora })).toBeNull();
  });

  it('esta dentro de lo normal mientras la espera es corta', () => {
    expect(attentionLevel({ direction: 'inbound', lastMessageAt: hace(4), now: ahora })).toBe('ok');
  });

  it('los limites exactos no son rojo: a los 5 minutos avisa, y a los 10 tambien', () => {
    expect(attentionLevel({ direction: 'inbound', lastMessageAt: hace(5), now: ahora })).toBe(
      'aviso'
    );
    expect(attentionLevel({ direction: 'inbound', lastMessageAt: hace(10), now: ahora })).toBe(
      'aviso'
    );
  });

  it('un segundo mas alla del limite ya es urgente', () => {
    const pasado = new Date(
      ahora.getTime() - ATTENTION_THRESHOLDS.redSeconds * 1000 - 1000
    ).toISOString();
    expect(attentionLevel({ direction: 'inbound', lastMessageAt: pasado, now: ahora })).toBe(
      'alto'
    );
  });

  it('no cuenta tiempo negativo si la fecha viene del futuro', () => {
    const futuro = new Date(ahora.getTime() + 60_000).toISOString();
    expect(attentionLevel({ direction: 'inbound', lastMessageAt: futuro, now: ahora })).toBe('ok');
  });
});
