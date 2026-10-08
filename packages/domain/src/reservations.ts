import { firstValue, parseDate, toAmount } from './reservation-values';

/* Vocabulario de las reservas del proyecto SPA.
 *
 * Viene del dashboard que el equipo usa hoy (`js/domain.js`) y se muda aqui para que la API y la
 * interfaz compartan una sola definicion. No es una preferencia nuestra: los estados y las acciones
 * tienen que seguir coincidiendo con lo que la base de reservas espera, y las acciones con el SQL del
 * RPC que aplica la decision. Por eso hay pruebas que lo fijan.
 */

/** Acciones de decision. Deben coincidir con el SQL del RPC del proyecto de reservas. */
export const DECISION_ACTIONS = ['approved', 'rejected', 'needs_info'] as const;

export type ReservationDecisionAction = (typeof DECISION_ACTIONS)[number];

/** Como se cuenta cada decision en pantalla. */
export const DECISION_LABELS: Record<
  ReservationDecisionAction,
  { past: string; short: string; title: string; toast: string }
> = {
  approved: {
    past: 'aprobó el comprobante de',
    short: 'Aprobada',
    title: 'Comprobante aprobado',
    toast: 'Comprobante aprobado correctamente.'
  },
  rejected: {
    past: 'rechazó el comprobante de',
    short: 'Rechazada',
    title: 'Comprobante rechazado',
    toast: 'Comprobante rechazado.'
  },
  needs_info: {
    past: 'solicitó información a',
    short: 'Información',
    title: 'Información solicitada',
    toast: 'Se marcó la reserva como información pendiente.'
  }
};

/** Estados con los que se muestra una pre-reserva, en el orden de la barra de filtros. */
export const RESERVATION_STATUSES = [
  'pending',
  'review',
  'info',
  'processing',
  'confirmed',
  'rejected'
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: 'Pendiente de pago',
  review: 'Por revisar',
  info: 'Información solicitada',
  processing: 'En confirmación',
  confirmed: 'Confirmada',
  rejected: 'Comprobante rechazado'
};

/** Estados que cuentan como «por gestionar»: piden accion del equipo. */
export const MANAGE_STATUSES: ReservationStatus[] = ['pending', 'review', 'info', 'processing'];

/** De donde salio el monto que se muestra: la operacion necesita saberlo para confiar en el. */
export const AMOUNT_SOURCE_LABELS = {
  comprobante: 'monto leído del comprobante',
  esperado: 'monto esperado del servicio',
  reserva: 'monto registrado en la reserva',
  'sin monto': 'sin monto registrado'
} as const;

/** Motivos de revision de pago que ya calcula n8n, en texto legible. */
export const PAYMENT_REASON_LABELS: Record<string, string> = {
  ESTADO_PAGO_NO_CORROBORADO: 'El estado del pago no está corroborado',
  SIN_RASTREO_NI_REFERENCIA_BANCARIA: 'Sin clave de rastreo ni referencia bancaria',
  FALTA_FOLIO_PARA_IDENTIFICAR_COMPROBANTE: 'Falta folio para identificar el comprobante',
  TITULAR_INCOMPLETO_O_NO_VISIBLE: 'Titular incompleto o no visible',
  MONTO_INSUFICIENTE_O_NO_LEGIBLE: 'Monto insuficiente o no legible'
};

/* ---------- Los estados que la base escribe de verdad ----------
 *
 * La columna no esta normalizada: el mismo hecho aparece escrito de varias formas segun quien lo
 * escribio. Estas listas vienen del dashboard y se conservan **tal cual**: «limpiarlas» a la ligera
 * cambiaria lo que el equipo ve hoy, y son la unica fuente de esa traduccion.
 */
export const RESERVATION_DATABASE_STATES = {
  confirmed: [
    'confirmado',
    'confirmada',
    'confirmed',
    'completado',
    'completada',
    'pagado',
    'reserva_confirmada',
    'aprobado'
  ],
  processing: [
    'procesando_pabau',
    'procesando',
    'en_proceso',
    'pendiente_pabau',
    'esperando_pabau',
    'en_confirmacion',
    'creando_retencion'
  ],
  rejected: [
    'rechazado',
    'rechazada',
    'pago_rechazado',
    'cancelado',
    'cancelada',
    'expirado',
    'expirado_sin_pago',
    'expirada',
    'abandonado'
  ],
  review: [
    'requiere_revision',
    'requiere_revision_pago',
    'revision_pago',
    'en_revision',
    'comprobante_en_revision',
    'requiere_verificacion'
  ]
} as const;

/**
 * Compara el estado crudo de la base con una de esas listas.
 *
 * La base escribe `CONFIRMADA`, `confirmada` o ` confirmada ` para el mismo hecho, asi que la
 * comparacion ignora mayusculas y espacios y rechaza el vacio: un estado vacio no es ningun estado.
 */
export function matchesDatabaseState(state: unknown, states: readonly string[]): boolean {
  const texto = String(state ?? '')
    .trim()
    .toLowerCase();
  return texto !== '' && states.includes(texto);
}

/* ---------- La fila cruda, traducida ---------- */

function asText(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

/** Fecha en que la pre-reserva entro al sistema (no la fecha de la cita). */
export function enteredAtOf(row: Record<string, unknown>): unknown {
  return firstValue(row.revisadaEn, row.creadaEn, row.actualizadaEn, row.comprobante_revision_at);
}

/** Fecha en que la reserva quedo confirmada, o en que fallo. */
export function closedAtOf(row: Record<string, unknown>): unknown {
  return firstValue(
    row.confirmadaEn,
    row.retencionExpiraEn,
    row.actualizadaEn,
    row.revisadaEn,
    row.creadaEn
  );
}

/**
 * Pre-reserva leida de la base de reservas.
 *
 * Se declara campo por campo en lugar de arrastrar la fila entera: esto es un limite del sistema, y
 * lo que entra se elige. Si alguna pantalla necesita otra columna, se anade aqui a proposito.
 */
export type ReservationDraft = {
  cerradaEn: Date | null;
  confirmada: boolean;
  confirmadaEn: string | null;
  correo: string | null;
  creadaEn: string | null;
  entroEn: Date | null;
  estado: string;
  evidencia: Record<string, unknown> | null;
  horarioEn: unknown;
  horarioPendiente: boolean;
  horarioProgramado: Date | null;
  id: number | null;
  intentosPago: number | null;
  motivoRevision: string | null;
  motivosPago: string[];
  monto: number;
  montoEsperado: number;
  nombre: string | null;
  pagoRecibido: boolean;
  procesandoDesde: Date | null;
  retencionExpiraEn: Date | null;
  revisadaEn: string | null;
  servicio: string | null;
  servicioCodigo: string | null;
  telefono: string | null;
  actualizadaEn: string | null;
};

/**
 * Traduce una fila de pre-reserva.
 *
 * La base tiene el mismo dato en varias columnas segun quien lo escribio, asi que casi todo campo
 * dice de donde puede venir, en orden de preferencia. Y el monto real casi siempre vive en la
 * evidencia del comprobante, no en la columna de la reserva: por eso se mira ahi tambien.
 */
export function normalizeDraft(row: Record<string, unknown>): ReservationDraft {
  const horarioEn = firstValue(
    row.masaje_inicio,
    row.jacuzzi_inicio,
    row.fecha_reserva,
    row.fecha_servicio,
    row.inicio
  );
  const evidencia =
    row.comprobante_revision_datos && typeof row.comprobante_revision_datos === 'object'
      ? (row.comprobante_revision_datos as Record<string, unknown>)
      : null;

  const borrador: ReservationDraft = {
    actualizadaEn:
      (firstValue(row.updated_at, row.actualizado_at, row.comprobante_revision_at) as
        | string
        | null) ?? null,
    cerradaEn: null,
    confirmada: Boolean(row.reserva_confirmada),
    confirmadaEn: (firstValue(row.pabau_confirmado_at, row.confirmado_at) as string | null) ?? null,
    correo: (firstValue(row.email, row.correo, evidencia?.email) as string | null) ?? null,
    creadaEn:
      (firstValue(
        row.created_at,
        row.creado_at,
        row.fecha_creacion,
        row.comprobante_revision_at
      ) as string | null) ?? null,
    entroEn: null,
    estado: asText(row.estado_reserva),
    evidencia,
    horarioEn: horarioEn ?? null,
    horarioPendiente: Boolean(row.horario_pendiente),
    horarioProgramado: parseDate(horarioEn),
    id: Number.isFinite(Number(row.id)) ? Number(row.id) : null,
    intentosPago: Number.isFinite(Number(row.intentos_pago)) ? Number(row.intentos_pago) : null,
    motivoRevision:
      (firstValue(row.motivo_revision, evidencia?.motivo_clasificacion) as string | null) ?? null,
    motivosPago: Array.isArray(evidencia?.motivos_revision_pago)
      ? (evidencia?.motivos_revision_pago as string[])
      : [],
    monto: toAmount(
      firstValue(
        row.monto_pagado,
        evidencia?.monto_documento,
        evidencia?.monto_pago,
        row.monto,
        row.valor,
        row.total
      )
    ),
    montoEsperado: toAmount(firstValue(evidencia?.monto_esperado, evidencia?.monto_documento)),
    nombre:
      (firstValue(
        row.nombre,
        row.cliente,
        row.nombre_cliente,
        evidencia?.nombre_reserva,
        evidencia?.nombre_perfil
      ) as string | null) ?? null,
    pagoRecibido: Boolean(row.pago_recibido),
    procesandoDesde: parseDate(row.procesando_desde),
    retencionExpiraEn: parseDate(row.retencion_expira_at),
    revisadaEn:
      (firstValue(row.comprobante_revision_at, row.actualizado_at, row.updated_at) as
        | string
        | null) ?? null,
    servicio:
      (firstValue(row.nombre_servicio, row.servicio, row.servicios) as string | null) ?? null,
    servicioCodigo: (firstValue(row.servicio, row.service_agua_id) as string | null) ?? null,
    telefono:
      (firstValue(row.phone, row.telefono, row.whatsapp, row.celular, evidencia?.phone) as
        | string
        | null) ?? null
  };

  /* entroEn: cuando llego la pre-reserva (la pantalla se rige por esta fecha, no por la de la cita).
     cerradaEn: cuando se confirmo o cuando fallo. */
  borrador.entroEn = parseDate(enteredAtOf(borrador as unknown as Record<string, unknown>));
  borrador.cerradaEn = parseDate(closedAtOf(borrador as unknown as Record<string, unknown>));
  return borrador;
}
