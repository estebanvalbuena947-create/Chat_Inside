import type { SupabaseServerClient } from '@chat-zernio/config';
import {
  hasMetaUserIdentifiers,
  metaUserIdentifiers,
  SIN_IDENTIFICADORES_DEL_CLIENTE
} from '@chat-zernio/domain';
/**
 * Envio de conversiones a Meta.
 *
 * Toma los eventos pendientes de la cola y los manda a Zernio, que los retransmite a Meta.
 *
 * Tres decisiones que conviene entender:
 *
 *   1. La identidad del cliente NO se guarda en la cola: se reconstruye al enviar, leyendo el
 *      contacto y la configuracion del espacio. Asi los datos personales no se duplican en la base,
 *      y apagar el envio de contactos afecta tambien a los eventos que aun estaban pendientes.
 *   2. Meta responde 200 aunque rechace el evento: el fallo viene en eventsFailed. Por eso aqui se
 *      mira ese campo y nunca el codigo, que es el error tipico de esta integracion.
 *   3. Reintentar es seguro: el eventId es estable, asi que un reenvio no cuenta dos veces.
 */

export const MAX_CONVERSION_ATTEMPTS = 5;
export const CONVERSIONS_PER_RUN = 25;

/** Si al evento le quedan intentos. */
export function shouldRetryConversion(attempts: number): boolean {
  return attempts < MAX_CONVERSION_ATTEMPTS;
}

/**
 * Motivo del rechazo, si Meta lo dio. Devuelve nulo cuando el evento fue aceptado.
 *
 * Meta responde 200 y rechaza por dentro: sin mirar eventsFailed, un evento perdido pasaria por
 * exitoso.
 */
export function conversionFailureReason(result: {
  eventsFailed: number;
  failures: Array<{ message?: string }>;
}): string | null {
  if (result.eventsFailed <= 0) return null;
  const primero = result.failures[0];
  const mensaje = primero && typeof primero.message === 'string' ? primero.message.trim() : '';
  return mensaje.length > 0 ? mensaje : 'Meta rechazo el evento sin detallar el motivo.';
}

/** Segundos unix, que es lo que exige Meta. En milisegundos responde "Invalid event_time". */
export function toUnixSeconds(instant: string | Date): number {
  const fecha = instant instanceof Date ? instant : new Date(instant);
  return Math.floor(fecha.getTime() / 1000);
}

export type ConversionSendOutcome =
  | { eventId: string; kind: 'sent'; traceId: string | null }
  | { eventId: string; kind: 'failed'; reason: string }
  | { eventId: string; kind: 'skipped'; reason: string };

type PendingRow = {
  attempts: number | null;
  currency: string | null;
  event_id: string;
  event_name: string;
  id: string;
  conversation_id: string | null;
  tenant_id: string;
  value_amount: number | null;
};

/**
 * Envia una tanda de conversiones pendientes y devuelve el resultado de cada una.
 *
 * El transporte se recibe por parametro para poder probar la logica sin red ni base de datos.
 */
export async function sendPendingConversions(input: {
  supabase: SupabaseServerClient;
  transport: (body: unknown) => Promise<unknown>;
}): Promise<ConversionSendOutcome[]> {
  const { data: pendientes, error } = await input.supabase
    .from('conversion_events')
    .select(
      'id, tenant_id, conversation_id, event_id, event_name, currency, value_amount, attempts'
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(CONVERSIONS_PER_RUN);

  if (error || !Array.isArray(pendientes)) return [];

  const resultados: ConversionSendOutcome[] = [];

  for (const fila of pendientes as PendingRow[]) {
    const intentos = fila.attempts ?? 0;

    if (!shouldRetryConversion(intentos)) {
      await input.supabase
        .from('conversion_events')
        .update({
          last_error: 'Se agotaron los intentos.',
          status: 'failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', fila.id);
      resultados.push({
        eventId: fila.event_id,
        kind: 'failed',
        reason: 'Se agotaron los intentos.'
      });
      continue;
    }

    const { data: integracion } = await input.supabase
      .from('conversion_integrations')
      .select(
        'provider_account_id, destination_id, include_contact_data, consent_ad_user_data, enabled, test_code'
      )
      .eq('tenant_id', fila.tenant_id)
      .maybeSingle();

    if (!integracion || integracion.enabled !== true) {
      resultados.push({
        eventId: fila.event_id,
        kind: 'skipped',
        reason: 'La integracion no esta activa.'
      });
      continue;
    }

    const { data: contacto } = await input.supabase
      .from('conversations')
      .select('contact:contacts(email, external_reference, phone_e164, platform_user_id)')
      .eq('id', fila.conversation_id ?? '')
      .maybeSingle();

    const datos = (contacto?.contact ?? null) as {
      email?: string | null;
      external_reference?: string | null;
      phone_e164?: string | null;
      platform_user_id?: string | null;
    } | null;

    // El identificador se resuelve con la misma funcion que usa la API al encolar: una sola regla
    // para los dos caminos, y lee la columna que el sistema SI rellena (`external_reference`).
    const user = metaUserIdentifiers(
      {
        email: datos?.email,
        externalReference: datos?.external_reference,
        phoneE164: datos?.phone_e164,
        platformUserId: datos?.platform_user_id
      },
      { includeContactData: integracion.include_contact_data === true }
    );

    if (!hasMetaUserIdentifiers(user)) {
      await input.supabase
        .from('conversion_events')
        .update({
          last_error: SIN_IDENTIFICADORES_DEL_CLIENTE,
          status: 'skipped',
          updated_at: new Date().toISOString()
        })
        .eq('id', fila.id);
      resultados.push({
        eventId: fila.event_id,
        kind: 'skipped',
        reason: SIN_IDENTIFICADORES_DEL_CLIENTE
      });
      continue;
    }

    const body: Record<string, unknown> = {
      accountId: integracion.provider_account_id,
      destinationId: integracion.destination_id,
      events: [
        {
          actionSource: 'crm',
          currency: fila.currency ?? 'MXN',
          eventId: fila.event_id,
          eventName: fila.event_name,
          eventTime: toUnixSeconds(new Date()),
          user,
          value: fila.value_amount ?? 0
        }
      ]
    };
    if (integracion.test_code) body.testCode = integracion.test_code;
    if (integracion.consent_ad_user_data) {
      body.consent = { adUserData: integracion.consent_ad_user_data };
    }

    try {
      const respuesta = (await input.transport(body)) as {
        eventsFailed?: number;
        failures?: Array<{ message?: string }>;
        traceId?: string | null;
      };
      const motivo = conversionFailureReason({
        eventsFailed: respuesta.eventsFailed ?? 0,
        failures: respuesta.failures ?? []
      });

      if (motivo) {
        await input.supabase
          .from('conversion_events')
          .update({
            attempts: intentos + 1,
            last_error: motivo,
            status: shouldRetryConversion(intentos + 1) ? 'pending' : 'failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', fila.id);
        resultados.push({ eventId: fila.event_id, kind: 'failed', reason: motivo });
        continue;
      }

      await input.supabase
        .from('conversion_events')
        .update({
          attempts: intentos + 1,
          last_error: null,
          sent_at: new Date().toISOString(),
          status: 'sent',
          trace_id: respuesta.traceId ?? null,
          updated_at: new Date().toISOString()
        })
        .eq('id', fila.id);
      resultados.push({ eventId: fila.event_id, kind: 'sent', traceId: respuesta.traceId ?? null });
    } catch (error) {
      const motivo = error instanceof Error ? error.message : 'Fallo al enviar la conversion.';
      await input.supabase
        .from('conversion_events')
        .update({
          attempts: intentos + 1,
          last_error: motivo,
          status: shouldRetryConversion(intentos + 1) ? 'pending' : 'failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', fila.id);
      resultados.push({ eventId: fila.event_id, kind: 'failed', reason: motivo });
    }
  }

  return resultados;
}

/** Transporte real contra Zernio. */
export function createZernioTransport(apiKey: string): (body: unknown) => Promise<unknown> {
  return async (body: unknown) => {
    const response = await fetch('https://zernio.com/api/v1/ads/conversions', {
      body: JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      method: 'POST'
    });
    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) {
      const mensaje =
        typeof payload === 'object' && payload !== null && 'error' in payload
          ? String((payload as { error?: unknown }).error ?? '')
          : '';
      throw new Error(mensaje || `Zernio respondio ${response.status}.`);
    }
    return payload;
  };
}
