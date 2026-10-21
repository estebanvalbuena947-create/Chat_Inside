import { describe, expect, it } from 'vitest';
import { buildReservationKpis, statusOf, summarizeDraftDays } from './reservation-board';
import { normalizeDraft, reservationStatusText } from './reservations';

const now = new Date('2026-10-20T18:00:00Z');
const raw = (id: number, created_at: unknown, estado_reserva = 'pendiente_pago') =>
  normalizeDraft({
    id,
    created_at,
    estado_reserva,
    monto_pagado: 100,
    comprobante_revision_at: '2026-10-21T18:00:00Z',
    masaje_inicio: '2026-10-25T12:00:00Z'
  });
const rows = [
  raw(1, '2026-10-20T05:59:59Z'),
  raw(2, '2026-10-20T06:00:00Z'),
  raw(3, '2026-10-21T05:59:59Z', 'requiere_revision_pago'),
  raw(4, '2026-10-21T06:00:00Z'),
  raw(5, null),
  raw(6, 'invalida'),
  raw(7, '2026-10-20T10:00:00Z', 'cancelando_expirada')
];
const calculate = (draftDay?: string) => buildReservationKpis(rows, [], [], [], { now, draftDay });

describe('prereservas por gestionar en el día de creación', () => {
  it('usa creación y no revisión, actualización o cita', () => {
    expect(rows[1]?.entroEn?.toISOString()).toBe('2026-10-20T06:00:00.000Z');
    expect(rows[4]?.creadaEn).toBeNull();
    expect(rows[4]?.entroEn).toBeNull();
    expect(rows[5]?.entroEn).toBeNull();
  });
  it.each(['created_at', 'creado_at', 'fecha_creacion'])(
    'acepta creación explícita en %s',
    (key) => {
      expect(
        normalizeDraft({
          [key]: '2026-10-20T10:00:00Z',
          comprobante_revision_at: '2026-10-21T12:00:00Z'
        }).entroEn?.toISOString()
      ).toBe('2026-10-20T10:00:00.000Z');
    }
  );
  it('el KPI cuenta exactamente la lista operativa y suma su monto', () => {
    const result = calculate('2026-10-20');
    expect(result.porGestionar.map((row) => row.id)).toEqual([2, 3]);
    expect(result.kpis.porGestionar).toBe(result.porGestionar.length);
    expect(result.kpis.montoPendiente).toBe(200);
    expect(result.kpis.pendientes).toBe(1);
    expect(result.kpis.porRevisar).toBe(1);
    expect(result.estados.size).toBe(rows.length);
  });
  it('respeta ambos extremos de medianoche en México', () => {
    expect(calculate('2026-10-19').porGestionar.map((row) => row.id)).toEqual([1]);
    expect(calculate('2026-10-21').porGestionar.map((row) => row.id)).toEqual([4]);
  });
  it('un día vacío no hereda pendientes de otros días', () => {
    expect(calculate('2026-10-22').kpis.porGestionar).toBe(0);
    expect(calculate('2026-10-22').kpis.montoPendiente).toBe(0);
  });
  it('todos los días incluye también los pendientes sin creación', () => {
    expect(calculate().porGestionar.map((row) => row.id)).toEqual([1, 2, 4, 5, 6, 3]);
    expect(calculate().kpis.porGestionar).toBe(6);
  });
  it('la gráfica agrupa creación en la misma zona del listado', () => {
    expect(summarizeDraftDays(rows, '2026-10-20')).toEqual([{ date: '2026-10-20', total: 3 }]);
  });
  it.each(['cancelando_expirada', ' CANCELANDO_EXPIRADA ', 'Cancelando_Expirada'])(
    'excluye cancelación automática %s',
    (estado_reserva) => {
      const draft = raw(9, '2026-10-20T10:00:00Z', estado_reserva);
      expect(statusOf(draft)).toBe('rejected');
      expect(reservationStatusText(draft, 'rejected')).toBe('Cancelación por vencimiento');
      expect(buildReservationKpis([draft], [], [], [], { now }).porGestionar).toEqual([]);
    }
  );
  it('conserva la prioridad de confirmación y decisión', () => {
    const draft = raw(9, null, 'cancelando_expirada');
    expect(statusOf({ ...draft, confirmada: true })).toBe('confirmed');
    expect(statusOf(draft, { accion: 'needs_info' })).toBe('info');
    expect(reservationStatusText(draft, 'info')).toBe('Información solicitada');
  });
});
