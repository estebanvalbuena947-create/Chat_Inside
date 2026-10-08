import { describe, expect, it } from 'vitest';
import {
  AMOUNT_SOURCE_LABELS,
  DECISION_ACTIONS,
  DECISION_LABELS,
  MANAGE_STATUSES,
  matchesDatabaseState,
  PAYMENT_REASON_LABELS,
  RESERVATION_DATABASE_STATES,
  RESERVATION_STATUSES,
  RESERVATION_STATUS_LABELS
} from './reservations';

describe('vocabulario de reservas', () => {
  it('las decisiones son exactamente las tres que acepta el RPC del proyecto de reservas', () => {
    expect(DECISION_ACTIONS).toEqual(['approved', 'rejected', 'needs_info']);
  });

  it('cada decision tiene como contarla, y ninguna se queda sin texto', () => {
    for (const accion of DECISION_ACTIONS) {
      const etiqueta = DECISION_LABELS[accion];
      expect(etiqueta.short.length).toBeGreaterThan(0);
      expect(etiqueta.title.length).toBeGreaterThan(0);
      expect(etiqueta.toast.length).toBeGreaterThan(0);
      expect(etiqueta.past.length).toBeGreaterThan(0);
    }
  });

  it('los estados y su orden no cambian sin querer', () => {
    expect(RESERVATION_STATUSES).toEqual([
      'pending',
      'review',
      'info',
      'processing',
      'confirmed',
      'rejected'
    ]);
    for (const estado of RESERVATION_STATUSES) {
      expect(RESERVATION_STATUS_LABELS[estado]).toBeTruthy();
    }
  });

  it('por gestionar son los cuatro que piden accion del equipo', () => {
    expect(MANAGE_STATUSES).toEqual(['pending', 'review', 'info', 'processing']);
    // Confirmada y rechazada ya no piden nada: no estan en la lista.
    expect(MANAGE_STATUSES).not.toContain('confirmed');
    expect(MANAGE_STATUSES).not.toContain('rejected');
  });

  it('el monto siempre dice de donde salio', () => {
    expect(Object.keys(AMOUNT_SOURCE_LABELS).sort()).toEqual([
      'comprobante',
      'esperado',
      'reserva',
      'sin monto'
    ]);
  });

  it('los motivos que calcula n8n se traducen, incluido el que hoy aparece', () => {
    expect(PAYMENT_REASON_LABELS.ESTADO_PAGO_NO_CORROBORADO).toBe(
      'El estado del pago no está corroborado'
    );
    expect(Object.keys(PAYMENT_REASON_LABELS)).toHaveLength(5);
  });
});

describe('estados crudos de la base de reservas', () => {
  it('reconoce el mismo hecho escrito de varias formas', () => {
    expect(matchesDatabaseState(' CONFIRMADA ', RESERVATION_DATABASE_STATES.confirmed)).toBe(true);
    expect(matchesDatabaseState('reserva_confirmada', RESERVATION_DATABASE_STATES.confirmed)).toBe(
      true
    );
    expect(matchesDatabaseState('requiere_revision_pago', RESERVATION_DATABASE_STATES.review)).toBe(
      true
    );
    expect(matchesDatabaseState('procesando_pabau', RESERVATION_DATABASE_STATES.processing)).toBe(
      true
    );
    expect(matchesDatabaseState('expirado_sin_pago', RESERVATION_DATABASE_STATES.rejected)).toBe(
      true
    );
  });

  it('no confunde un estado con otro', () => {
    expect(matchesDatabaseState('confirmada', RESERVATION_DATABASE_STATES.rejected)).toBe(false);
    expect(matchesDatabaseState('rechazado', RESERVATION_DATABASE_STATES.confirmed)).toBe(false);
  });

  it('un estado vacio o ausente no es ningun estado', () => {
    expect(matchesDatabaseState('', RESERVATION_DATABASE_STATES.confirmed)).toBe(false);
    expect(matchesDatabaseState('   ', RESERVATION_DATABASE_STATES.confirmed)).toBe(false);
    expect(matchesDatabaseState(null, RESERVATION_DATABASE_STATES.confirmed)).toBe(false);
    expect(matchesDatabaseState(undefined, RESERVATION_DATABASE_STATES.confirmed)).toBe(false);
  });
});
