/* Normalizadores de la reserva confirmada, la decision y el comprobante.
 *
 * Vienen de `js/domain.js` del dashboard y se conservan fieles: cada columna alternativa existe
 * porque esa base la escribe asi. Se separan de `reservations.ts` para no hacer un archivo enorme,
 * igual que el original separaba `core.js` de `domain.js`.
 */
import type { ReservationDraft } from './reservations';
import { firstValue, parseDate, toAmount } from './reservation-values';

/** Reserva ya confirmada, leida de la base. */
export type ReservationConfirmed = {
  confirmadaEn: string | null;
  correo: string | null;
  horarioEn: unknown;
  horarioProgramado: Date | null;
  id: number | null;
  monto: number;
  nombre: string | null;
  servicio: string | null;
  sucursal: string | null;
  telefono: string | null;
};

/**
 * Traduce una reserva confirmada.
 *
 * Aqui el monto **si** vive en la propia reserva (`monto_pagado`, `monto`, `valor`, `total`), a
 * diferencia de la pre-reserva, donde casi siempre esta en la evidencia del comprobante.
 */
export function normalizeConfirmed(row: Record<string, unknown>): ReservationConfirmed {
  const horarioEn = firstValue(
    row.masaje_inicio,
    row.jacuzzi_inicio,
    row.fecha_reserva,
    row.fecha_servicio
  );

  return {
    confirmadaEn:
      (firstValue(row.pabau_confirmado_at, row.confirmado_at, row.updated_at, row.created_at) as
        | string
        | null) ?? null,
    correo: (firstValue(row.email, row.correo) as string | null) ?? null,
    horarioEn: horarioEn ?? null,
    horarioProgramado: parseDate(horarioEn),
    id: Number.isFinite(Number(row.id)) ? Number(row.id) : null,
    monto: toAmount(firstValue(row.monto_pagado, row.monto, row.valor, row.total)),
    nombre: (firstValue(row.nombre, row.cliente, row.nombre_cliente) as string | null) ?? null,
    servicio:
      (firstValue(row.nombre_servicio, row.servicio, row.servicios) as string | null) ?? null,
    sucursal: (firstValue(row.sucursal, row.branch, row.localidad) as string | null) ?? null,
    telefono: (firstValue(row.phone, row.telefono, row.whatsapp) as string | null) ?? null
  };
}

/** Decision tomada sobre un comprobante, con quien la tomo. */
export type ReservationDecision = {
  accion: string;
  autor: string | null;
  borradorId: number | null;
  creadaEn: string | null;
  estadoAnterior: string | null;
  estadoResultante: string | null;
  id: number | null;
  nota: string | null;
};

/**
 * Traduce una decision.
 *
 * `accion` se deja como la escribio la base —solo en minusculas— y **no** se valida contra las tres
 * que acepta el RPC: una accion desconocida es un dato que hay que mirar, no algo que convenga
 * disfrazar de `needs_info`. Solo si viene vacia se asume que se pidio informacion, como el
 * dashboard. `autor` sale del correo que la base guarda, que es la autoria que hoy no mostrabamos.
 */
export function normalizeDecision(row: Record<string, unknown>): ReservationDecision {
  const borradorId = firstValue(row.reservation_draft_id, row.reserva_draft_id, row.draft_id);

  return {
    accion:
      String(row.action ?? '')
        .trim()
        .toLowerCase() || 'needs_info',
    autor: (firstValue(row.decided_by_email, row.email, row.usuario) as string | null) ?? null,
    borradorId: Number.isFinite(Number(borradorId)) ? Number(borradorId) : null,
    creadaEn: (firstValue(row.created_at, row.creado_at) as string | null) ?? null,
    estadoAnterior: (firstValue(row.previous_status, row.estado_anterior) as string | null) ?? null,
    estadoResultante: (firstValue(row.resulting_status, row.estado_nuevo) as string | null) ?? null,
    id: Number.isFinite(Number(row.id)) ? Number(row.id) : null,
    nota: (firstValue(row.note, row.nota, row.comentario) as string | null) ?? null
  };
}

/** Comprobante de pago, leido de su tabla o reconstruido desde la evidencia. */
export type ReservationReceipt = {
  actualizadoEn: string | null;
  banco: string | null;
  borradorId: number | null;
  confianza: number | null;
  cuenta: string | null;
  datos: Record<string, unknown>;
  desdeEvidencia: boolean;
  estado: string;
  mediaUrl: string | null;
  metodo: string | null;
  monto: number;
  montoEsperado: number;
  motivos: string[];
  pagadoEn: unknown;
  recibidoEn: string | null;
  referencia: string | null;
  titular: string | null;
};

function asText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asTextArray(value: unknown): string[] {
  return Array.isArray(value) ? (value as string[]) : [];
}

/** Monto del comprobante segun la evidencia guardada en la pre-reserva. */
export function evidenceAmount(draft: Record<string, unknown> | null | undefined): number {
  const evidencia = asRecord(draft?.evidencia ?? draft?.comprobante_revision_datos);
  const value = firstValue(
    evidencia.monto_documento,
    evidencia.monto_pago,
    evidencia.monto,
    evidencia.importe
  );
  return value === null ? 0 : toAmount(value);
}

/** Traduce un comprobante de la tabla de comprobantes. */
export function normalizeReceipt(row: Record<string, unknown>): ReservationReceipt {
  const datos = asRecord(row.datos);
  const mediaUrl = firstValue(
    row.media_url,
    row.url,
    row.comprobante_url,
    datos.media_url,
    datos.url,
    datos.comprobante_url
  );
  const pagadoEn = firstValue(
    row.fecha_pago,
    datos.fecha_pago,
    datos.fecha_pago_documento,
    datos.fecha_pago_es_hoy ? row.creado_at : null
  );
  const borradorId = firstValue(row.reserva_draft_id, row.draft_id, row.reservation_draft_id);

  return {
    actualizadoEn:
      (firstValue(row.actualizado_at, row.updated_at, row.creado_at, row.created_at) as
        | string
        | null) ?? null,
    banco: (firstValue(datos.banco_emisor, datos.banco_receptor) as string | null) ?? null,
    borradorId: Number.isFinite(Number(borradorId)) ? Number(borradorId) : null,
    confianza: typeof datos.confianza_pago === 'number' ? datos.confianza_pago : null,
    cuenta:
      (firstValue(datos.cuenta_visible, datos.cuenta_beneficiaria_visible) as string | null) ??
      null,
    datos,
    desdeEvidencia: false,
    estado: asText(
      firstValue(row.estado, row.status, datos.comprobante_estado, datos.estado, 'revision')
    ),
    mediaUrl: mediaUrl ? String(mediaUrl) : null,
    metodo:
      (firstValue(row.metodo, row.metodo_pago, datos.metodo, datos.metodo_pago, datos.tipo_pago) as
        | string
        | null) ?? null,
    monto: toAmount(
      firstValue(row.monto_pago, row.monto, datos.monto_pago, datos.monto_documento, datos.monto)
    ),
    montoEsperado: toAmount(firstValue(datos.monto_esperado, datos.monto_documento)),
    motivos: asTextArray(datos.motivos_revision_pago),
    pagadoEn: pagadoEn ?? null,
    recibidoEn:
      (firstValue(row.creado_at, row.created_at, row.actualizado_at, row.updated_at) as
        | string
        | null) ?? null,
    referencia:
      (firstValue(
        row.referencia,
        row.reference,
        datos.rastreo,
        datos.folio,
        datos.referencia,
        datos.numero_comprobante
      ) as string | null) ?? null,
    titular:
      (firstValue(datos.nombre_beneficiario, datos.nombre_ordenante) as string | null) ?? null
  };
}

/**
 * Comprobante construido desde la evidencia de la pre-reserva.
 *
 * Existe porque la tabla de comprobantes puede no tener todavia fila para esa reserva, y el equipo
 * necesita ver igual el archivo, el monto y los motivos. Devuelve nulo cuando la evidencia no trae
 * nada que mostrar: sin archivo, sin monto y sin fecha de pago no hay comprobante que enseñar.
 */
export function receiptFromEvidence(draft: ReservationDraft): ReservationReceipt | null {
  const evidencia = asRecord(draft?.evidencia);
  if (!draft || !Object.keys(evidencia).length) return null;

  const mediaUrl = firstValue(evidencia.media_url, evidencia.url, evidencia.comprobante_url);
  const monto = evidenceAmount(draft as unknown as Record<string, unknown>);
  if (!mediaUrl && !monto && !evidencia.fecha_pago_documento) return null;

  return {
    actualizadoEn: draft.revisadaEn ?? draft.actualizadaEn,
    banco: (firstValue(evidencia.banco_emisor, evidencia.banco_receptor) as string | null) ?? null,
    borradorId: draft.id,
    confianza: typeof evidencia.confianza_pago === 'number' ? evidencia.confianza_pago : null,
    cuenta:
      (firstValue(evidencia.cuenta_visible, evidencia.cuenta_beneficiaria_visible) as
        | string
        | null) ?? null,
    datos: evidencia,
    desdeEvidencia: true,
    estado: asText(firstValue(evidencia.comprobante_estado, evidencia.estado, 'revision')),
    mediaUrl: mediaUrl ? String(mediaUrl) : null,
    metodo: (firstValue(evidencia.tipo_pago, evidencia.metodo_pago) as string | null) ?? null,
    monto,
    montoEsperado: toAmount(firstValue(evidencia.monto_esperado, evidencia.monto_documento)),
    motivos: asTextArray(evidencia.motivos_revision_pago),
    pagadoEn: firstValue(evidencia.fecha_pago_documento, evidencia.fecha_pago) ?? null,
    recibidoEn: draft.revisadaEn ?? draft.actualizadaEn,
    referencia:
      (firstValue(evidencia.rastreo, evidencia.folio, evidencia.numero_comprobante) as
        | string
        | null) ?? null,
    titular:
      (firstValue(evidencia.nombre_beneficiario, evidencia.nombre_ordenante) as string | null) ??
      null
  };
}
