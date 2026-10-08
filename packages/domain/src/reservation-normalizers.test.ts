import { describe, expect, it } from 'vitest';
import {
  evidenceAmount,
  normalizeConfirmed,
  normalizeDecision,
  normalizeReceipt,
  receiptFromEvidence
} from './reservation-normalizers';
import { normalizeDraft } from './reservations';

describe('traducir una reserva confirmada', () => {
  it('el monto, aqui, vive en la propia reserva', () => {
    expect(normalizeConfirmed({ monto_pagado: '$1,200' }).monto).toBe(1200);
    expect(normalizeConfirmed({ valor: '999,50' }).monto).toBe(999.5);
    expect(normalizeConfirmed({}).monto).toBe(0);
  });

  it('trae la sucursal, que la pre-reserva no tiene', () => {
    expect(normalizeConfirmed({ branch: 'Polanco' }).sucursal).toBe('Polanco');
    expect(normalizeConfirmed({ localidad: 'Lomas' }).sucursal).toBe('Lomas');
  });

  it('fecha la confirmacion con la primera marca que exista', () => {
    expect(normalizeConfirmed({ confirmado_at: '2026-09-22T16:00:00.000Z' }).confirmadaEn).toBe(
      '2026-09-22T16:00:00.000Z'
    );
    expect(normalizeConfirmed({}).confirmadaEn).toBeNull();
  });

  it('una fila vacia no inventa datos', () => {
    const confirmada = normalizeConfirmed({});
    expect(confirmada.id).toBeNull();
    expect(confirmada.nombre).toBeNull();
    expect(confirmada.horarioProgramado).toBeNull();
  });
});

describe('traducir una decision', () => {
  it('deja la accion como la escribio la base, sin disfrazarla', () => {
    expect(normalizeDecision({ action: ' APPROVED ' }).accion).toBe('approved');
    // Una accion desconocida se conserva: es un dato que hay que mirar, no un `needs_info`.
    expect(normalizeDecision({ action: 'otra_cosa' }).accion).toBe('otra_cosa');
  });

  it('solo cuando viene vacia se asume que se pidio informacion', () => {
    expect(normalizeDecision({}).accion).toBe('needs_info');
    expect(normalizeDecision({ action: '   ' }).accion).toBe('needs_info');
  });

  it('guarda quien decidio, que es la autoria que hoy no mostrabamos', () => {
    expect(normalizeDecision({ decided_by_email: 'ana@ejemplo.com' }).autor).toBe(
      'ana@ejemplo.com'
    );
  });

  it('enlaza la decision con su pre-reserva y con el cambio de estado', () => {
    const decision = normalizeDecision({
      estado_anterior: 'review',
      estado_nuevo: 'confirmed',
      reserva_draft_id: '42',
      nota: 'Comprobante correcto'
    });
    expect(decision.borradorId).toBe(42);
    expect(decision.estadoAnterior).toBe('review');
    expect(decision.estadoResultante).toBe('confirmed');
    expect(decision.nota).toBe('Comprobante correcto');
  });
});

describe('traducir un comprobante', () => {
  it('lee el archivo, la referencia y los datos bancarios de la fila o de sus datos', () => {
    const comprobante = normalizeReceipt({
      datos: {
        banco_emisor: 'BBVA',
        folio: 'F-9',
        nombre_ordenante: 'Ana',
        tipo_pago: 'transferencia'
      },
      media_url: 'https://ejemplo.com/comprobante.jpg'
    });
    expect(comprobante.mediaUrl).toBe('https://ejemplo.com/comprobante.jpg');
    expect(comprobante.referencia).toBe('F-9');
    expect(comprobante.banco).toBe('BBVA');
    expect(comprobante.titular).toBe('Ana');
    expect(comprobante.metodo).toBe('transferencia');
  });

  it('sin estado escrito, el comprobante esta por revisar', () => {
    expect(normalizeReceipt({}).estado).toBe('revision');
    expect(normalizeReceipt({ estado: ' RECHAZADO ' }).estado).toBe('rechazado');
  });

  it('la confianza del pago solo es un numero cuando lo es', () => {
    expect(normalizeReceipt({ datos: { confianza_pago: 0.9 } }).confianza).toBe(0.9);
    expect(normalizeReceipt({ datos: { confianza_pago: 'alta' } }).confianza).toBeNull();
  });
});

describe('el comprobante reconstruido desde la evidencia', () => {
  const borrador = (evidencia: Record<string, unknown>) =>
    normalizeDraft({ comprobante_revision_datos: evidencia, id: '9' });

  it('existe cuando la tabla de comprobantes todavia no tiene fila para esa reserva', () => {
    const comprobante = receiptFromEvidence(
      borrador({ media_url: 'https://ejemplo.com/pago.jpg', monto_documento: '1,200' })
    );
    expect(comprobante?.desdeEvidencia).toBe(true);
    expect(comprobante?.mediaUrl).toBe('https://ejemplo.com/pago.jpg');
    expect(comprobante?.monto).toBe(1200);
    expect(comprobante?.borradorId).toBe(9);
  });

  it('no se inventa un comprobante cuando la evidencia no trae nada que enseñar', () => {
    expect(receiptFromEvidence(borrador({}))).toBeNull();
    expect(receiptFromEvidence(normalizeDraft({}))).toBeNull();
  });

  it('basta la fecha de pago del documento para poder mostrarlo', () => {
    const comprobante = receiptFromEvidence(borrador({ fecha_pago_documento: '2026-09-21' }));
    expect(comprobante).not.toBeNull();
    expect(comprobante?.monto).toBe(0);
  });

  it('el monto de la evidencia sale del primero de los cuatro nombres', () => {
    expect(evidenceAmount({ comprobante_revision_datos: { monto_pago: '500' } })).toBe(500);
    expect(evidenceAmount({ evidencia: { importe: '1.000,00' } })).toBe(1000);
    expect(evidenceAmount({})).toBe(0);
  });
});
