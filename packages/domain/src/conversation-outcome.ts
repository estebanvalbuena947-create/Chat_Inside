/**
 * Hecho de negocio: conversacion ganada con su valor total.
 *
 * Esta es la unica regla que decide cuando una conversacion queda ganada y con que valor. La usan
 * las dos puertas que existen —el boton de la interfaz y el bot cuando detecta el pago— para que no
 * haya dos implementaciones que puedan divergir.
 *
 * No hay nombres de etiquetas, clientes ni servicios dentro: la regla es general.
 */

/** Resultado del negocio. Hoy solo existe `ganado`; la ausencia significa sin cerrar. */
export const CONVERSATION_OUTCOME_WON = 'ganado';

/** Quien registro el hecho. */
export const OUTCOME_RECORDED_BY = {
  person: 'persona',
  bot: 'bot'
} as const;

export type OutcomeRecordedBy = (typeof OUTCOME_RECORDED_BY)[keyof typeof OUTCOME_RECORDED_BY];

/** Limites que impone la base de datos: numeric(12, 2). */
const MAX_AMOUNT = 9_999_999_999.99;

/** Codigo de moneda ISO 4217. */
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export type WonOutcome = {
  readonly outcome: typeof CONVERSATION_OUTCOME_WON;
  readonly amount: number;
  readonly currency: string;
  readonly recordedBy: OutcomeRecordedBy;
  readonly recordedAt: Date;
  /** Obligatorio cuando lo registra una persona: queda claro quien lo hizo. */
  readonly recordedByUserId?: string | null;
  /** Obligatorio cuando lo registra el bot: es la clave de idempotencia. */
  readonly sourceReference?: string | null;
};

export type WonOutcomeInput = {
  readonly amount: number;
  readonly currency: string;
  readonly recordedBy: OutcomeRecordedBy;
  readonly recordedAt: Date;
  readonly recordedByUserId?: string | null;
  readonly sourceReference?: string | null;
};

export type WonOutcomeResult =
  | { readonly ok: true; readonly value: WonOutcome }
  | { readonly ok: false; readonly reason: string };

function hasValidAmount(amount: number): boolean {
  if (!Number.isFinite(amount)) return false;
  if (amount < 0) return false;
  if (amount > MAX_AMOUNT) return false;
  // La base guarda dos decimales: un valor con mas precision se rechaza en lugar de redondearse en
  // silencio, porque redondear un importe sin avisar es peor que rechazarlo.
  return Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-9;
}

/**
 * Valida el hecho de negocio. Un negocio ganado SIEMPRE trae valor, moneda, origen y fecha; la base
 * impone lo mismo, y aqui se comprueba antes para dar un motivo claro en lugar de un error de datos.
 */
export function validateWonOutcome(input: WonOutcomeInput): WonOutcomeResult {
  if (!hasValidAmount(input.amount)) {
    return {
      ok: false,
      reason:
        'El valor total debe ser un importe valido, no negativo y con dos decimales como maximo.'
    };
  }

  if (!CURRENCY_PATTERN.test(input.currency)) {
    return {
      ok: false,
      reason: 'La moneda debe ser un codigo ISO 4217 de tres letras mayusculas.'
    };
  }

  if (
    input.recordedBy !== OUTCOME_RECORDED_BY.person &&
    input.recordedBy !== OUTCOME_RECORDED_BY.bot
  ) {
    return { ok: false, reason: 'El hecho solo puede registrarlo una persona o el bot.' };
  }

  if (!(input.recordedAt instanceof Date) || Number.isNaN(input.recordedAt.getTime())) {
    return { ok: false, reason: 'La fecha del hecho no es valida.' };
  }

  const recordedByUserId = input.recordedByUserId?.trim() ?? '';
  const sourceReference = input.sourceReference?.trim() ?? '';

  if (input.recordedBy === OUTCOME_RECORDED_BY.person && recordedByUserId.length === 0) {
    return { ok: false, reason: 'Si lo registra una persona, hace falta saber quien.' };
  }

  if (input.recordedBy === OUTCOME_RECORDED_BY.bot && sourceReference.length === 0) {
    return {
      ok: false,
      reason: 'Si lo registra el bot, hace falta la referencia del pago para no duplicarlo.'
    };
  }

  return {
    ok: true,
    value: {
      outcome: CONVERSATION_OUTCOME_WON,
      amount: input.amount,
      currency: input.currency,
      recordedBy: input.recordedBy,
      recordedAt: input.recordedAt,
      recordedByUserId: input.recordedBy === OUTCOME_RECORDED_BY.person ? recordedByUserId : null,
      sourceReference: sourceReference.length > 0 ? sourceReference : null
    }
  };
}

/**
 * Decide si el hecho entrante cambia algo. Evita escrituras inutiles y, sobre todo, que el bot
 * reenvie la conversion a Meta por haber detectado el mismo pago dos veces.
 *
 * - Sin hecho previo: se aplica.
 * - Misma referencia de origen y mismo importe: no se aplica (es el mismo pago).
 * - Misma referencia y otro importe: se aplica, porque fue una correccion; queda registrado quien y
 *   cuando, de modo que siempre se ve el ultimo valor y su responsable.
 * - Registrado por una persona, mismo importe y mismo origen: no se aplica.
 */
export function shouldApplyWonOutcome(existing: WonOutcome | null, incoming: WonOutcome): boolean {
  if (existing === null) return true;

  const sameAmount = existing.amount === incoming.amount && existing.currency === incoming.currency;
  const sameReference =
    existing.sourceReference !== null &&
    incoming.sourceReference !== null &&
    existing.sourceReference === incoming.sourceReference;

  if (sameReference && sameAmount) return false;

  if (!sameReference && sameAmount && existing.recordedBy === incoming.recordedBy) return false;

  return true;
}
