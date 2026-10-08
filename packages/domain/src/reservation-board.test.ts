import { describe, expect, it } from 'vitest';
import {
  buildReservationKpis,
  indexByDraftId,
  indexDecisions,
  isConfirmed,
  isReviewable,
  statusOf,
  visibleAmount
} from './reservation-board';
import type {
  ReservationConfirmed,
  ReservationDecision,
  ReservationReceipt
} from './reservation-normalizers';
import { normalizeDecision, normalizeReceipt } from './reservation-normalizers';
import { normalizeDraft } from './reservations';

const AHORA = new Date('2026-10-08T18:00:00.000Z');

const borrador = (overrides: Record<string, unknown> = {}) =>
  normalizeDraft({ id: '1', ...overrides });

const decision = (overrides: Record<string, unknown> = {}) =>
  normalizeDecision({ id: '1', reservation_draft_id: '1', ...overrides });

const comprobante = (overrides: Record<string, unknown> = {}) =>
  normalizeReceipt({ reserva_draft_id: '1', ...overrides });

const confirmada = (overrides: Partial<ReservationConfirmed> = {}): ReservationConfirmed => ({
  confirmadaEn: null,
  correo: null,
  horarioEn: null,
  horarioProgramado: null,
  id: 9,
  monto: 0,
  nombre: null,
  servicio: null,
  sucursal: null,
  telefono: null,
  ...overrides
});

describe('el estado visible de una pre-reserva', () => {
  it('lo confirmado manda sobre todo lo demas', () => {
    expect(statusOf(borrador({ reserva_confirmada: true, estado_reserva: 'rechazado' }))).toBe(
      'confirmed'
    );
    expect(statusOf(borrador({ estado_reserva: 'CONFIRMADA' }))).toBe('confirmed');
  });

  it('la ultima decision manda sobre el estado crudo', () => {
    const fila = borrador({ estado_reserva: 'requiere_revision_pago' });
    expect(statusOf(fila, decision({ action: 'rejected' }))).toBe('rejected');
    expect(statusOf(fila, decision({ action: 'needs_info' }))).toBe('info');
    expect(statusOf(fila, decision({ action: 'approved' }))).toBe('confirmed');
    // Una decision desconocida no cambia nada: se sigue mirando el estado crudo.
    expect(statusOf(fila, decision({ action: 'otra_cosa' }))).toBe('review');
  });

  it('traduce el estado crudo de la tabla', () => {
    expect(statusOf(borrador({ estado_reserva: 'procesando_pabau' }))).toBe('processing');
    expect(statusOf(borrador({ estado_reserva: 'expirado_sin_pago' }))).toBe('rejected');
    expect(statusOf(borrador({ estado_reserva: 'requiere_revision' }))).toBe('review');
    expect(statusOf(borrador({ estado_reserva: 'lo_que_sea' }))).toBe('pending');
    expect(statusOf(borrador({}))).toBe('pending');
  });

  it('revisable es solo lo que pide revision y no esta confirmado', () => {
    expect(isReviewable(borrador({ estado_reserva: 'requiere_revision' }))).toBe(true);
    expect(
      isReviewable(borrador({ estado_reserva: 'requiere_revision', reserva_confirmada: true }))
    ).toBe(false);
    expect(isConfirmed(borrador({ estado_reserva: 'confirmado' }))).toBe(true);
  });
});

describe('los indices del tablero', () => {
  it('se queda con la ultima decision de cada pre-reserva', () => {
    const index = indexDecisions([
      decision({ action: 'rejected', created_at: '2026-10-01T10:00:00.000Z' }),
      decision({ action: 'approved', created_at: '2026-10-02T10:00:00.000Z' })
    ]);
    expect(index.get(1)?.accion).toBe('approved');
  });

  it('se queda con el primer comprobante de cada pre-reserva', () => {
    const index = indexByDraftId([comprobante({ estado: 'uno' }), comprobante({ estado: 'dos' })]);
    expect(index.get(1)?.estado).toBe('uno');
  });
});

describe('el monto visible y su origen', () => {
  it('dice de donde salio el monto, por prioridad', () => {
    expect(visibleAmount(borrador({ monto_pagado: '500' })).source).toBe('reserva');
    expect(visibleAmount(borrador({}), comprobante({ monto: '700' })).source).toBe('comprobante');
    expect(
      visibleAmount(borrador({ comprobante_revision_datos: { monto_esperado: '900' } })).source
    ).toBe('esperado');
    expect(visibleAmount(borrador({})).source).toBe('sin monto');
    expect(visibleAmount(borrador({})).amount).toBe(0);
  });
});

describe('los KPIs del tablero', () => {
  const calcular = (
    drafts: ReturnType<typeof borrador>[],
    confirmed: ReservationConfirmed[] = [],
    decisions: ReservationDecision[] = [],
    receipts: ReservationReceipt[] = []
  ) => buildReservationKpis(drafts, confirmed, decisions, receipts, { now: AHORA }).kpis;

  it('cuenta por estado y suma lo que hay que gestionar', () => {
    const kpis = calcular([
      borrador({ id: '1', estado_reserva: 'requiere_revision', monto_pagado: '100' }),
      borrador({ id: '2', estado_reserva: 'procesando_pabau', monto_pagado: '200' }),
      borrador({ id: '3', estado_reserva: 'expirado' }),
      borrador({ id: '4' })
    ]);
    expect(kpis.pendientes).toBe(1);
    expect(kpis.porRevisar).toBe(1);
    expect(kpis.enConfirmacion).toBe(1);
    expect(kpis.rechazadas).toBe(1);
    expect(kpis.porGestionar).toBe(3);
    expect(kpis.montoPendiente).toBe(300);
  });

  it('mide «hoy» por la fecha de confirmacion, no por la de la cita', () => {
    const kpis = calcular(
      [
        borrador({
          id: '1',
          reserva_confirmada: true,
          comprobante_revision_at: '2026-10-08T10:00:00.000Z',
          monto_pagado: '400'
        })
      ],
      [confirmada({ confirmadaEn: '2026-10-08T15:00:00.000Z', monto: 600 })],
      [],
      []
    );
    expect(kpis.confirmadasHoy).toBe(2);
    expect(kpis.montoConfirmadoHoy).toBe(1000);
    expect(kpis.ultimaConfirmacionEn).toBe('2026-10-08T15:00:00.000Z');
  });

  it('avisa de las retenciones que vencen en la proxima hora, y de ninguna otra', () => {
    const kpis = calcular([
      borrador({
        id: '1',
        estado_reserva: 'requiere_revision',
        retencion_expira_at: '2026-10-08T18:30:00.000Z'
      }),
      borrador({
        id: '2',
        estado_reserva: 'requiere_revision',
        retencion_expira_at: '2026-10-08T23:00:00.000Z'
      }),
      borrador({
        id: '3',
        estado_reserva: 'requiere_revision',
        retencion_expira_at: '2026-10-08T17:00:00.000Z'
      })
    ]);
    expect(kpis.retencionesPorVencer).toHaveLength(1);
    expect(kpis.retencionesPorVencer[0]?.borradorId).toBe(1);
    expect(kpis.retencionesPorVencer[0]?.expiraEn).toBe('2026-10-08T18:30:00.000Z');
  });

  it('cuenta las citas de las proximas 24 horas y los comprobantes por revisar', () => {
    const kpis = calcular(
      [borrador({ id: '1', estado_reserva: 'requiere_revision' })],
      [
        confirmada({ horarioProgramado: new Date('2026-10-09T10:00:00.000Z') }),
        confirmada({ horarioProgramado: new Date('2026-10-20T10:00:00.000Z') })
      ],
      [],
      [comprobante({})]
    );
    expect(kpis.proximas24h).toBe(1);
    expect(kpis.comprobantesPorRevisar).toBe(1);
  });

  it('sin nada, todo en cero y sin fechas inventadas', () => {
    const kpis = calcular([]);
    expect(kpis.porGestionar).toBe(0);
    expect(kpis.montoPendiente).toBe(0);
    expect(kpis.retencionesPorVencer).toEqual([]);
    expect(kpis.ultimaConfirmacionEn).toBeNull();
    expect(kpis.ultimaDecisionEn).toBeNull();
  });
});
