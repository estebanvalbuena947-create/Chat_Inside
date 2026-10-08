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
