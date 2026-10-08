import {
  createServerSupabaseClient,
  supabaseServerEnvironmentSchema,
  type SupabaseServerClient
} from '@chat-zernio/config';
import { parseWhatsappButtonTapNotification } from '@chat-zernio/domain';
import { isReclaimDue } from './abandoned-claims';
import {
  createN8nTransport,
  N8nDeliveryError,
  parseN8nWebhookUrl,
  type N8nTransport
} from './n8n-transport';
import {
  claimEvent,
  completeEvent,
  failEvent,
  listPendingEvents,
  OUTBOX_TAP_EVENT,
  reclaimAbandonedEvents,
  type OutboxEvent
} from './outbox-claim';

/**
 * Avisa a n8n de los toques de boton de plantilla.
 *
 * Es un despachador propio y no parte del de mensajes por una razon concreta: son dos efectos
 * distintos con dos fallos distintos. Una caida de n8n no puede mezclarse con un fallo de envio de
 * WhatsApp. Lo que si comparten es el protocolo de la cola (`outbox-claim`).
 *
 * El aviso llega aqui ya persistido: se encola cuando el mensaje del cliente se guarda, asi que un
 * n8n caido no impide que la conversacion siga.
 */
export class TapNotificationWorker {
  private isRunning = false;
  private lastReclaimAt = 0;

  constructor(
    private readonly createClient: () => SupabaseServerClient,
    private readonly transport: N8nTransport,
    private readonly now: () => number = Date.now
  ) {}

  async drain(limit = 10): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const supabase = this.createClient();
      await this.reclaimAbandoned(supabase);
      const { errorCode, events } = await listPendingEvents(supabase, OUTBOX_TAP_EVENT, limit);
      if (errorCode) {
        console.error(
          JSON.stringify({ event: 'worker.n8n_notifications_list_failed', failureCode: errorCode })
        );
        return;
      }
      for (const event of events) await this.claimAndDispatch(supabase, event);
    } finally {
      this.isRunning = false;
    }
  }

  private async reclaimAbandoned(supabase: SupabaseServerClient): Promise<void> {
    const now = this.now();
    if (!isReclaimDue(this.lastReclaimAt, now)) return;
    this.lastReclaimAt = now;

    const { errorCode, reclaimed } = await reclaimAbandonedEvents(supabase, now);
    if (errorCode) {
      console.error(
        JSON.stringify({
          event: 'worker.n8n_notifications_reclaim_failed',
          failureCode: errorCode
        })
      );
      return;
    }
    if (reclaimed > 0) {
      console.info(JSON.stringify({ event: 'worker.n8n_notifications_reclaimed', reclaimed }));
    }
  }

  private async claimAndDispatch(
    supabase: SupabaseServerClient,
    event: OutboxEvent
  ): Promise<void> {
    const { attempt, claimed } = await claimEvent(supabase, event);
    if (!claimed) return;

    let notification;
    try {
      // El aviso se valida al salir, no solo al entrar: si alguien escribio en la cola algo que no
      // cumple el contrato, tiene que fallar visiblemente en lugar de viajar a n8n.
      notification = parseWhatsappButtonTapNotification(event.payload);
    } catch {
      await failEvent(supabase, event, {
        attempt,
        code: 'invalid_tap_notification',
        retryable: false
      });
      console.error(
        JSON.stringify({
          event: 'worker.n8n_notification_failed',
          failureCode: 'invalid_tap_notification'
        })
      );
      return;
    }

    try {
      await this.transport.notify({ idempotencyKey: event.idempotency_key, notification });
      const completed = await completeEvent(supabase, event.id);
      if (!completed) {
        // El aviso salio pero no se pudo cerrar el evento: se trata como reintentable y la clave de
        // idempotencia evita que n8n lo cuente dos veces.
        throw new N8nDeliveryError(true, 'n8n_notification_completion_failed');
      }
      console.info(JSON.stringify({ event: 'worker.n8n_notification_dispatched' }));
    } catch (error) {
      const delivery =
        error instanceof N8nDeliveryError
          ? error
          : new N8nDeliveryError(true, 'n8n_notification_failed');
      await failEvent(
        supabase,
        event,
        { attempt, code: delivery.code, retryable: delivery.retryable },
        this.now
      );
      console.error(
        JSON.stringify({ event: 'worker.n8n_notification_failed', failureCode: delivery.code })
      );
    }
  }
}

/**
 * El trabajador, o nada si no hay a donde avisar.
 *
 * Sin direccion o sin secreto no se construye: es mejor que el ciclo no tenga nada que drenar y que
 * el motivo quede escrito, a que cada toque acumule un fallo en la cola.
 */
export function createTapNotificationWorker(
  environment: Record<string, string | undefined> = process.env
): TapNotificationWorker | null {
  const url = parseN8nWebhookUrl(environment.N8N_AGENT_WEBHOOK_URL);
  const secret = environment.N8N_AGENT_AUTH_SECRET?.trim();
  if (!url || !secret) return null;

  const configuration = supabaseServerEnvironmentSchema.parse(environment);
  return new TapNotificationWorker(
    () => createServerSupabaseClient(configuration),
    createN8nTransport({ secret, url })
  );
}
