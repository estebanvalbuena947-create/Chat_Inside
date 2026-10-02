import type { ZernioConversionEvent } from '../zernio/zernio-api.client';

/**
 * Construye el evento de conversion de una conversacion ganada.
 *
 * Es una funcion pura a proposito: la forma del evento se prueba sin base de datos ni red, que es
 * donde de verdad importan los detalles finos (los segundos, la clave estable, que datos salen).
 *
 * Dos reglas que sostiene:
 *   1. Una conversion por conversacion. El eventId es estable, asi que volver a marcar el negocio
 *      reutiliza el mismo identificador y Meta lo deduplica en lugar de contar dos veces.
 *   2. Los datos de contacto salen SOLO si la configuracion lo permite. La identidad de plataforma
 *      va siempre; el correo y el telefono son un interruptor que se apaga sin desplegar.
 */

export type WonConversionContact = {
  email: string | null;
  phoneE164: string | null;
  platformUserId: string | null;
};

export type WonConversionInput = {
  amount: number;
  contact: WonConversionContact;
  conversationId: string;
  currency: string;
  includeContactData: boolean;
  /** Instante del hecho de negocio, en ISO. */
  occurredAt: string;
  tenantId: string;
};

export type BuiltConversionEvent = {
  event: ZernioConversionEvent;
  /** Clave de deduplicacion local, la misma que viaja como eventId. */
  eventId: string;
};

export type BuiltConversionResult =
  | { readonly ok: true; readonly value: BuiltConversionEvent }
  | { readonly ok: false; readonly reason: string };

/** Conversion ganada: el evento que Meta reconoce como compra. */
export const WON_CONVERSION_EVENT_NAME = 'Purchase';

export function wonConversionEventId(tenantId: string, conversationId: string): string {
  return `won:${tenantId}:${conversationId}`;
}

export function buildWonConversionEvent(input: WonConversionInput): BuiltConversionResult {
  const user: NonNullable<ZernioConversionEvent['user']> = {};

  if (input.contact.platformUserId) {
    user.externalId = input.contact.platformUserId;
  }
  if (input.includeContactData) {
    if (input.contact.email) user.email = input.contact.email;
    if (input.contact.phoneE164) user.phone = input.contact.phoneE164;
  }

  // Sin ningun identificador, Meta no puede atribuir la conversion: enviarla no aporta nada y
  // ensuciaria el registro con un evento inutil.
  if (Object.keys(user).length === 0) {
    return {
      ok: false,
      reason:
        'La conversion no lleva ningun identificador del cliente, asi que no se puede atribuir.'
    };
  }

  if (!Number.isFinite(input.amount) || input.amount < 0) {
    return { ok: false, reason: 'El valor de la conversion no es un importe valido.' };
  }

  const instante = new Date(input.occurredAt);
  if (Number.isNaN(instante.getTime())) {
    return { ok: false, reason: 'La fecha del hecho de negocio no es valida.' };
  }

  const eventId = wonConversionEventId(input.tenantId, input.conversationId);

  return {
    ok: true,
    value: {
      eventId,
      event: {
        actionSource: 'crm',
        currency: input.currency,
        eventId,
        eventName: WON_CONVERSION_EVENT_NAME,
        // Meta exige SEGUNDOS unix. En milisegundos responde "Invalid event_time".
        eventTime: Math.floor(instante.getTime() / 1000),
        user,
        value: input.amount
      }
    }
  };
}
