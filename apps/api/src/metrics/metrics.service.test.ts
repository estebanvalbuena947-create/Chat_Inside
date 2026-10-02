import { describe, expect, it } from 'vitest';
import { summarizeMessages, type MetricRow } from './metrics.service';

const fila = (createdAt: string, direction: string, platform: string | null): MetricRow => ({
  createdAt,
  direction,
  platform
});

describe('resumen de actividad', () => {
  it('cuenta entrantes y salientes por dia', () => {
    const r = summarizeMessages(
      [
        fila('2026-10-01T10:00:00.000Z', 'inbound', 'instagram'),
        fila('2026-10-01T11:00:00.000Z', 'outbound', 'instagram'),
        fila('2026-10-02T09:00:00.000Z', 'inbound', 'instagram')
      ],
      { closedConversations: 0, days: 30, truncated: false }
    );
    expect(r.messagesPerDay).toEqual([
      { date: '2026-10-01', received: 1, sent: 1 },
      { date: '2026-10-02', received: 1, sent: 0 }
    ]);
    expect(r.totalMessages).toBe(3);
  });

  it('agrupa por plataforma y ordena de mayor a menor actividad', () => {
    const r = summarizeMessages(
      [
        fila('2026-10-01T10:00:00.000Z', 'inbound', 'instagram'),
        fila('2026-10-01T10:01:00.000Z', 'inbound', 'instagram'),
        fila('2026-10-01T10:02:00.000Z', 'inbound', 'tiktok')
      ],
      { closedConversations: 0, days: 30, truncated: false }
    );
    expect(r.messagesByChannel).toEqual([
      { platform: 'instagram', received: 2, sent: 0 },
      { platform: 'tiktok', received: 1, sent: 0 }
    ]);
  });

  it('no inventa plataforma cuando el mensaje no tiene canal', () => {
    const r = summarizeMessages([fila('2026-10-01T10:00:00.000Z', 'inbound', null)], {
      closedConversations: 0,
      days: 30,
      truncated: false
    });
    expect(r.messagesByChannel[0].platform).toBe('sin canal');
  });

  it('devuelve un resumen vacio, no un error, cuando no hay actividad', () => {
    const r = summarizeMessages([], { closedConversations: 4, days: 7, truncated: false });
    expect(r.messagesPerDay).toEqual([]);
    expect(r.messagesByChannel).toEqual([]);
    expect(r.totalMessages).toBe(0);
    expect(r.closedConversations).toBe(4);
    expect(r.periodDays).toBe(7);
  });

  it('marca el resultado como minimo cuando se alcanzo el tope de lectura', () => {
    const r = summarizeMessages([], { closedConversations: 0, days: 30, truncated: true });
    expect(r.truncated).toBe(true);
  });
});
