import { describe, expect, it } from 'vitest';
import {
  AMOUNT_SOURCE_LABELS,
  DECISION_ACTIONS,
  DECISION_LABELS,
  MANAGE_STATUSES,
  matchesDatabaseState,
  normalizeDraft,
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

describe('traducir una pre-reserva de la base', () => {
  it('toma el dato de la columna donde este', () => {
    const borrador = normalizeDraft({
      cliente: '  Ana  ',
      estado_reserva: ' CONFIRMADA ',
      phone: '',
      servicio: 'Temazcal',
      telefono: '55 1234 5678'
    });

    // El valor llega tal como esta en la base, con sus espacios: el original tampoco los recortaba.
    // Recortarlos es una decision para el limite de la API, no para esta traduccion.
    expect(borrador.nombre).toBe('  Ana  ');
    expect(borrador.telefono).toBe('55 1234 5678');
    expect(borrador.servicio).toBe('Temazcal');
    // El estado se compara despues sin mayusculas ni espacios.
    expect(borrador.estado).toBe('confirmada');
  });

  it('prefiere el monto de la reserva y, si no lo hay, el del comprobante', () => {
    expect(normalizeDraft({ monto_pagado: '$1,200.00' }).monto).toBe(1200);
    expect(
      normalizeDraft({ comprobante_revision_datos: { monto_documento: '1.200,50' } }).monto
    ).toBe(1200.5);
    expect(normalizeDraft({}).monto).toBe(0);
  });

  it('lee el correo y el telefono tambien de la evidencia', () => {
    const borrador = normalizeDraft({
      comprobante_revision_datos: {
        email: 'ana@ejemplo.com',
        nombre_perfil: 'Ana P',
        phone: '5511'
      }
    });
    expect(borrador.correo).toBe('ana@ejemplo.com');
    expect(borrador.telefono).toBe('5511');
    expect(borrador.nombre).toBe('Ana P');
  });

  it('guarda los motivos de revision de pago y los deja vacios si no vienen', () => {
    expect(
      normalizeDraft({
        comprobante_revision_datos: {
          motivos_revision_pago: ['SIN_RASTREO_NI_REFERENCIA_BANCARIA']
        }
      }).motivosPago
    ).toEqual(['SIN_RASTREO_NI_REFERENCIA_BANCARIA']);
    expect(normalizeDraft({}).motivosPago).toEqual([]);
  });

  it('no cree que hay evidencia cuando la columna no trae un objeto', () => {
    expect(normalizeDraft({ comprobante_revision_datos: 'si' }).evidencia).toBeNull();
    expect(normalizeDraft({}).evidencia).toBeNull();
  });

  it('fecha la entrada por la marca de revision y el cierre por la confirmacion', () => {
    const borrador = normalizeDraft({
      comprobante_revision_at: '2026-09-21T14:30:00.000Z',
      pabau_confirmado_at: '2026-09-22T16:00:00.000Z'
    });
    expect(borrador.revisadaEn).toBe('2026-09-21T14:30:00.000Z');
    expect(borrador.entroEn?.toISOString()).toBe('2026-09-21T14:30:00.000Z');
    expect(borrador.confirmadaEn).toBe('2026-09-22T16:00:00.000Z');
    expect(borrador.cerradaEn?.toISOString()).toBe('2026-09-22T16:00:00.000Z');
  });

  it('programa la cita con la primera fecha que exista', () => {
    expect(
      normalizeDraft({ jacuzzi_inicio: '2026-10-15 10:00:00' }).horarioProgramado
    ).not.toBeNull();
    expect(normalizeDraft({}).horarioProgramado).toBeNull();
  });

  it('una fila vacia no rompe nada ni inventa datos', () => {
    const borrador = normalizeDraft({});
    expect(borrador.id).toBeNull();
    expect(borrador.nombre).toBeNull();
    expect(borrador.estado).toBe('');
    expect(borrador.monto).toBe(0);
    expect(borrador.intentosPago).toBeNull();
    expect(borrador.entroEn).toBeNull();
    expect(borrador.cerradaEn).toBeNull();
  });

  it('no arrastra la fila entera: solo lo que este modelo declara', () => {
    const borrador = normalizeDraft({ id: '7', columna_interna: 'no debe salir' });
    expect(borrador.id).toBe(7);
    expect(Object.keys(borrador)).not.toContain('columna_interna');
  });
});
