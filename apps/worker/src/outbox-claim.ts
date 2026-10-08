import type { SupabaseServerClient } from '@chat-zernio/config';
import { abandonedBefore } from './abandoned-claims';

/**
 * El protocolo de la cola de salida, en un solo sitio.
 *
 * `outbox_events` lleva efectos externos de clases distintas: el envio de un mensaje y el aviso a
 * n8n de un toque de boton. Lo que comparten es COMO se reclama y se liquida un evento (estado,
 * intentos, espera creciente, reclamo abandonado); lo que cambia es a donde va cada uno y que
 * agregado actualiza. Tener el protocolo dos veces solo servia para que se separaran con el tiempo.
 *
 * El `event_type` es lo que separa las dos colas: cada despachador lista y reclama SOLO el suyo, asi
 * que un evento de una clase no puede acabar en el despachador de la otra.
 */

/** Evento que despacha un mensaje saliente de la bandeja. */
export const OUTBOX_MESSAGE_EVENT = 'zernio.message.dispatch';

/** Evento que avisa a n8n de un toque de boton de plantilla. */
export const OUTBOX_TAP_EVENT = 'n8n.whatsapp.button_tap';

/** Intentos antes de dar un evento por fallido. */
export const MAX_DISPATCH_ATTEMPTS = 3;

export type OutboxEvent = {
  attempts: number;
  id: string;
  idempotency_key: string;
  payload: unknown;
  tenant_id: string;
};

/** Espera creciente, con techo de un minuto, para no insistir a ciegas. */
export function retryAt(attempt: number, now: () => number = Date.now): string {
  return new Date(now() + Math.min(60_000, 1_000 * 2 ** attempt)).toISOString();
}

/** Los eventos pendientes de una clase, listos para intentarse. */
export async function listPendingEvents(
  supabase: SupabaseServerClient,
  eventType: string,
  limit: number
): Promise<{ errorCode: string | null; events: OutboxEvent[] }> {
  const { data, error } = await supabase
    .from('outbox_events')
    .select('id, tenant_id, payload, attempts, idempotency_key')
    .eq('event_type', eventType)
    .eq('state', 'pending')
    .is('processing_started_at', null)
    .lte('available_at', new Date().toISOString())
    .order('available_at', { ascending: true })
    .limit(limit);

  if (error) return { errorCode: error.code ?? 'unknown', events: [] };
  return { errorCode: null, events: (data ?? []) as OutboxEvent[] };
}

/** Toma el evento para si. Devuelve falso cuando otro ciclo se le adelanto. */
export async function claimEvent(
  supabase: SupabaseServerClient,
  event: OutboxEvent
): Promise<{ attempt: number; claimed: boolean }> {
  const attempt = event.attempts + 1;
  const { data, error } = await supabase
    .from('outbox_events')
    .update({
      attempts: attempt,
      processing_started_at: new Date().toISOString(),
      state: 'processing'
    })
    .eq('id', event.id)
    .eq('state', 'pending')
    .is('processing_started_at', null)
    .select('id')
    .maybeSingle();

  if (error || !data) return { attempt, claimed: false };
  return { attempt, claimed: true };
}

export async function completeEvent(
  supabase: SupabaseServerClient,
  eventId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('outbox_events')
    .update({
      processed_at: new Date().toISOString(),
      processing_started_at: null,
      state: 'completed'
    })
    .eq('id', eventId)
    .eq('state', 'processing');
  return !error;
}

/**
 * Cierra el intento: vuelve a la cola si merece otro intento, o queda fallido con su codigo.
 *
 * Devuelve si se reintentara, para que quien llama actualice su propio agregado (por ejemplo el
 * estado del mensaje) sin tener que repetir la regla de intentos.
 */
export async function failEvent(
  supabase: SupabaseServerClient,
  event: OutboxEvent,
  outcome: { attempt: number; code: string; retryable: boolean },
  now: () => number = Date.now
): Promise<{ retried: boolean }> {
  const retried = outcome.retryable && outcome.attempt < MAX_DISPATCH_ATTEMPTS;
  const { error } = await supabase
    .from('outbox_events')
    .update(
      retried
        ? {
            available_at: retryAt(outcome.attempt, now),
            failure_code: outcome.code,
            processing_started_at: null,
            state: 'pending'
          }
        : {
            failure_code: outcome.code,
            processed_at: new Date().toISOString(),
            processing_started_at: null,
            state: 'failed'
          }
    )
    .eq('id', event.id)
    .eq('state', 'processing');

  // Si no se pudo escribir el cierre, el reclamo queda abandonado y la recuperacion lo devuelve a
  // la cola: se informa de que NO se reintento para que nadie de por hecho lo contrario.
  if (error) return { retried: false };
  return { retried };
}

/**
 * Devuelve a la cola un evento cuyo reclamo quedo abandonado por una caida del proceso.
 *
 * El reenvio esta protegido por la clave de idempotencia estable del evento, de modo que repetirlo
 * no duplica el efecto. El presupuesto de intentos sigue acotando el ciclo.
 */
export async function reclaimAbandonedEvents(
  supabase: SupabaseServerClient,
  now: number
): Promise<{ errorCode: string | null; reclaimed: number }> {
  try {
    const { data, error } = await supabase
      .from('outbox_events')
      .update({
        available_at: new Date(now).toISOString(),
        processing_started_at: null,
        state: 'pending'
      })
      .eq('state', 'processing')
      .lt('processing_started_at', abandonedBefore(now))
      .select('id');

    if (error) return { errorCode: error.code ?? 'unknown', reclaimed: 0 };
    return { errorCode: null, reclaimed: Array.isArray(data) ? data.length : 0 };
  } catch {
    return { errorCode: 'unexpected', reclaimed: 0 };
  }
}
