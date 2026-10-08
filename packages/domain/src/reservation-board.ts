/* Estado visible y KPIs del tablero de reservas.
 *
 * Viene de `js/domain.js` del dashboard y se conserva fiel, incluida la prioridad para decidir el
 * estado: lo confirmado manda sobre la ultima decision, y la ultima decision manda sobre el estado
 * crudo de la tabla.
 *
 * Se separa en su propio archivo porque es la parte que se prueba sin base de datos: entra lo ya
 * normalizado y sale lo que el tablero muestra.
 */
import type {
  ReservationKpis,
  ReservationStatus,
  ReservationDecisionAction
} from '@chat-zernio/contracts';
import type {
  ReservationConfirmed,
  ReservationDecision,
  ReservationReceipt
} from './reservation-normalizers';
import type { ReservationDraft } from './reservations';
import { dayKeyInZone, parseDate, toAmount } from './reservation-values';
import { RESERVATION_DATABASE_STATES, matchesDatabaseState } from './reservations';

/** Una pre-reserva esta confirmada si lo dice la columna o si el estado crudo lo dice. */
export function isConfirmed(row: Pick<ReservationDraft, 'confirmada' | 'estado'>): boolean {
  if (row.confirmada) return true;
  return matchesDatabaseState(row.estado, RESERVATION_DATABASE_STATES.confirmed);
}

/** Requiere revision solo si el estado crudo lo dice y ademas no esta confirmada. */
export function isReviewable(row: Pick<ReservationDraft, 'confirmada' | 'estado'>): boolean {
  return matchesDatabaseState(row.estado, RESERVATION_DATABASE_STATES.review) && !isConfirmed(row);
}

/**
 * Estado visible de una pre-reserva.
 *
 * Prioridad: confirmada por la tabla > ultima decision del equipo > estado crudo. Las dos etiquetas
 * especiales del dashboard («Aprobada por el equipo» y «Sin estado registrado») se pierden a
 * proposito: el contrato lleva el estado, y el texto de pantalla es de la interfaz.
 */
export function statusOf(
  row: Pick<ReservationDraft, 'confirmada' | 'estado'>,
  latestDecision?: Pick<ReservationDecision, 'accion'> | undefined
): ReservationStatus {
  if (isConfirmed(row)) return 'confirmed';

  if (latestDecision) {
    const accion = latestDecision.accion as ReservationDecisionAction | string;
    if (accion === 'rejected') return 'rejected';
    if (accion === 'needs_info') return 'info';
    if (accion === 'approved') return 'confirmed';
  }

  const estado = row.estado;
  if (matchesDatabaseState(estado, RESERVATION_DATABASE_STATES.rejected)) return 'rejected';
  if (matchesDatabaseState(estado, RESERVATION_DATABASE_STATES.review)) return 'review';
  if (matchesDatabaseState(estado, RESERVATION_DATABASE_STATES.processing)) return 'processing';
  return 'pending';
}

/** La ultima decision de cada pre-reserva, por fecha. */
export function indexDecisions(
  decisions: ReservationDecision[]
): Map<number | null, ReservationDecision> {
  const map = new Map<number | null, ReservationDecision>();
  for (const decision of decisions) {
    const actual = map.get(decision.borradorId);
    if (!actual) {
      map.set(decision.borradorId, decision);
      continue;
    }
    const nueva = parseDate(decision.creadaEn)?.getTime() ?? 0;
    const previa = parseDate(actual.creadaEn)?.getTime() ?? 0;
    if (nueva > previa) map.set(decision.borradorId, decision);
  }
  return map;
}

/** El primer comprobante de cada pre-reserva. */
export function indexByDraftId(
  receipts: ReservationReceipt[]
): Map<number | null, ReservationReceipt> {
  const map = new Map<number | null, ReservationReceipt>();
  for (const receipt of receipts) {
    if (!map.has(receipt.borradorId)) map.set(receipt.borradorId, receipt);
  }
  return map;
}

/**
 * Monto de una pre-reserva, con su origen.
 *
 * No es una columna: la reserva casi nunca lo trae, asi que se busca por prioridad en el comprobante
 * y en la evidencia. Se informa de donde salio para que la operacion sepa en que se apoya.
 */
export function visibleAmount(
  draft: Pick<ReservationDraft, 'monto' | 'montoEsperado' | 'evidencia'>,
  receipt?: ReservationReceipt | null
): { amount: number; source: 'reserva' | 'comprobante' | 'esperado' | 'sin monto' } {
  if (draft.monto) return { amount: draft.monto, source: 'reserva' };
  if (receipt?.monto) return { amount: receipt.monto, source: 'comprobante' };
  if (draft.montoEsperado) return { amount: draft.montoEsperado, source: 'esperado' };
  return { amount: 0, source: 'sin monto' };
}

function dentroDeLaProximaHora(value: Date | null, now: Date): boolean {
  if (!value) return false;
  const diferencia = value.getTime() - now.getTime();
  return diferencia > 0 && diferencia <= 60 * 60 * 1000;
}

function dentroDe24Horas(value: Date | null, now: Date): boolean {
  if (!value) return false;
  const diferencia = value.getTime() - now.getTime();
  return diferencia >= 0 && diferencia <= 24 * 60 * 60 * 1000;
}

/** Lo que el tablero muestra arriba: conteos, importes y los dos avisos. */
export function buildReservationKpis(
  drafts: ReservationDraft[],
  confirmed: ReservationConfirmed[],
  decisions: ReservationDecision[],
  receipts: ReservationReceipt[],
  options: { now: Date; timeZone?: string }
): { estados: Map<number | null, ReservationStatus>; kpis: ReservationKpis } {
  const { now } = options;
  const porDecision = indexDecisions(decisions);
  const porComprobante = indexByDraftId(receipts);

  const estados = new Map<number | null, ReservationStatus>();
  for (const draft of drafts) {
    estados.set(draft.id, statusOf(draft, porDecision.get(draft.id)));
  }

  const conEstado = (claves: ReservationStatus[]) =>
    drafts.filter((draft) => claves.includes(estados.get(draft.id) as ReservationStatus));

  const pendientes = conEstado(['pending']);
  const porRevisar = conEstado(['review', 'info']);
  const enConfirmacion = conEstado(['processing']);
  const rechazadas = conEstado(['rejected']);
  const porGestionar = [...pendientes, ...porRevisar, ...enConfirmacion];

  /* «Hoy» se rige por la fecha en que la reserva se confirmo, no por la de la cita: una pre-reserva
     puede entrar hoy y tener cita en otra semana. */
  const hoy = dayKeyInZone(now, options.timeZone);
  const esDeHoy = (value: unknown) => dayKeyInZone(value, options.timeZone) === hoy;

  const confirmadasHoy = confirmed.filter((row) => esDeHoy(row.confirmadaEn));
  const borradoresConfirmadosHoy = drafts.filter(
    (draft) => estados.get(draft.id) === 'confirmed' && esDeHoy(draft.cerradaEn)
  );

  const montoConfirmadoHoy = [...confirmadasHoy, ...borradoresConfirmadosHoy].reduce(
    (total, row) => total + toAmount(row.monto),
    0
  );
  const montoPendiente = porGestionar.reduce(
    (total, draft) => total + visibleAmount(draft, porComprobante.get(draft.id)).amount,
    0
  );

  const retencionesPorVencer = porGestionar
    .filter((draft) => dentroDeLaProximaHora(draft.retencionExpiraEn, now))
    .sort((a, b) => (a.retencionExpiraEn?.getTime() ?? 0) - (b.retencionExpiraEn?.getTime() ?? 0))
    .map((draft) => ({
      borradorId: draft.id,
      expiraEn: (draft.retencionExpiraEn as Date).toISOString(),
      nombre: draft.nombre
    }));

  const ultimaConfirmacion = [...confirmadasHoy, ...borradoresConfirmadosHoy].reduce(
    (ultima, row) => Math.max(ultima, parseDate(row.confirmadaEn)?.getTime() ?? 0),
    0
  );
  const ultimaDecision = decisions.reduce(
    (ultima, decision) => Math.max(ultima, parseDate(decision.creadaEn)?.getTime() ?? 0),
    0
  );

  return {
    estados,
    kpis: {
      comprobantesPorRevisar: drafts.filter((draft) => Boolean(porComprobante.get(draft.id)))
        .length,
      confirmadasHoy: confirmadasHoy.length + borradoresConfirmadosHoy.length,
      enConfirmacion: enConfirmacion.length,
      montoConfirmadoHoy,
      montoPendiente,
      pendientes: pendientes.length,
      porGestionar: porGestionar.length,
      porRevisar: porRevisar.length,
      proximas24h: confirmed.filter((row) => dentroDe24Horas(row.horarioProgramado, now)).length,
      rechazadas: rechazadas.length,
      retencionesPorVencer,
      ultimaConfirmacionEn: ultimaConfirmacion ? new Date(ultimaConfirmacion).toISOString() : null,
      ultimaDecisionEn: ultimaDecision ? new Date(ultimaDecision).toISOString() : null
    }
  };
}
