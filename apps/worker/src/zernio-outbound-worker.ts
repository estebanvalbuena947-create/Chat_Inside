import {
  createServerSupabaseClient,
  supabaseServerEnvironmentSchema,
  type SupabaseServerClient
} from '@chat-zernio/config';
import { abandonedBefore, isReclaimDue } from './abandoned-claims';
import { z } from 'zod';

type OutboxEvent = {
  attempts: number;
  id: string;
  payload: unknown;
  tenant_id: string;
};

type DispatchInput = {
  accountId: string;
  body: string;
  conversationId: string;
  idempotencyKey: string;
};

type DispatchResult = {
  providerMessageId: string;
  sentAt: string | null;
};

const sendResponseSchema = z.object({
  data: z.object({
    messageId: z.string().trim().min(1).max(300),
    sentAt: z.string().datetime({ offset: true }).optional()
  })
});

export class ZernioDispatchError extends Error {
  constructor(
    readonly retryable: boolean,
    readonly code: string
  ) {
    super(code);
  }
}

export type ZernioDispatcher = { send(input: DispatchInput): Promise<DispatchResult> };

export function createZernioDispatcher(
  apiKey: string,
  request: typeof fetch = fetch
): ZernioDispatcher {
  return {
    async send(input: DispatchInput): Promise<DispatchResult> {
      const response = await request(
        `https://zernio.com/api/v1/inbox/conversations/${encodeURIComponent(input.conversationId)}/messages`,
        {
          body: JSON.stringify({ accountId: input.accountId, message: input.body }),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': input.idempotencyKey
          },
          method: 'POST',
          signal: AbortSignal.timeout(10_000)
        }
      );

      if (!response.ok) {
        throw new ZernioDispatchError(
          response.status === 408 ||
            response.status === 409 ||
            response.status === 429 ||
            response.status >= 500,
          `zernio_http_${response.status}`
        );
      }

      const payload = await response.json().catch(() => null);
      const parsed = sendResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new ZernioDispatchError(true, 'zernio_send_response_invalid');
      }

      return {
        providerMessageId: parsed.data.data.messageId,
        sentAt: parsed.data.data.sentAt ?? null
      };
    }
  };
}

function readMessageId(payload: unknown): string | null {
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('messageId' in payload) ||
    typeof payload.messageId !== 'string'
  ) {
    return null;
  }
  return payload.messageId;
}

function conversationIdFromReference(reference: unknown, providerAccountId: string): string | null {
  if (typeof reference !== 'string') return null;
  const prefix = `zernio:${providerAccountId}:conversation:`;
  if (!reference.startsWith(prefix)) return null;
  const value = reference.slice(prefix.length);
  return value ? value : null;
}

function messageReference(providerAccountId: string, providerMessageId: string): string {
  return `zernio:${providerAccountId}:message:${providerMessageId}`;
}

function retryAt(attempt: number): string {
  return new Date(Date.now() + Math.min(60_000, 1_000 * 2 ** attempt)).toISOString();
}

export class ZernioOutboundWorker {
  private isRunning = false;
  private lastReclaimAt = 0;

  constructor(
    private readonly createClient: () => SupabaseServerClient,
    private readonly dispatcher: ZernioDispatcher,
    private readonly now: () => number = Date.now
  ) {}

  async drain(limit = 10): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const supabase = this.createClient();
      await this.reclaimAbandonedDispatches(supabase);
      const { data: events, error } = await supabase
        .from('outbox_events')
        .select('id, tenant_id, payload, attempts')
        .eq('state', 'pending')
        .is('processing_started_at', null)
        .lte('available_at', new Date().toISOString())
        .order('available_at', { ascending: true })
        .limit(limit);
      if (error) {
        console.error(
          JSON.stringify({
            event: 'worker.outbox_list_failed',
            failureCode: error.code ?? 'unknown'
          })
        );
        return;
      }
      for (const event of (events ?? []) as OutboxEvent[])
        await this.claimAndProcess(supabase, event);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Devuelve a la cola un despacho cuyo reclamo quedo abandonado por una caida del proceso.
   * El reenvio esta protegido por la clave de idempotencia estable del evento, de modo que
   * repetirlo no duplica el mensaje. El presupuesto de intentos sigue acotando el ciclo.
   */
  private async reclaimAbandonedDispatches(supabase: SupabaseServerClient): Promise<void> {
    const now = this.now();
    if (!isReclaimDue(this.lastReclaimAt, now)) return;
    this.lastReclaimAt = now;

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

      if (error) {
        console.error(
          JSON.stringify({
            event: 'worker.outbox_dispatch_reclaim_failed',
            databaseCode: error.code ?? 'unknown'
          })
        );
        return;
      }

      const reclaimed = Array.isArray(data) ? data.length : 0;
      if (reclaimed > 0) {
        console.info(JSON.stringify({ event: 'worker.outbox_dispatch_reclaimed', reclaimed }));
      }
    } catch {
      // Recuperar reclamos es una red de seguridad: su fallo nunca debe detener el drenaje.
      console.error(
        JSON.stringify({
          event: 'worker.outbox_dispatch_reclaim_failed',
          databaseCode: 'unexpected'
        })
      );
    }
  }

  private async claimAndProcess(supabase: SupabaseServerClient, event: OutboxEvent): Promise<void> {
    const attempt = event.attempts + 1;
    const { data: claimed, error: claimError } = await supabase
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
    if (claimError || !claimed) return;

    const messageId = readMessageId(event.payload);
    if (!messageId)
      return this.fail(
        supabase,
        event,
        attempt,
        null,
        new ZernioDispatchError(false, 'invalid_outbox_payload')
      );

    try {
      const { data: message, error: messageError } = await supabase
        .from('messages')
        .select('id, body, conversation_id, channel_account_id, idempotency_key, status')
        .eq('id', messageId)
        .eq('tenant_id', event.tenant_id)
        .maybeSingle();
      if (messageError || !message || !message.channel_account_id || !message.idempotency_key) {
        throw new ZernioDispatchError(false, 'outbox_message_unavailable');
      }
      const { data: conversation, error: conversationError } = await supabase
        .from('conversations')
        .select('channel_account_id, external_reference')
        .eq('id', message.conversation_id)
        .eq('tenant_id', event.tenant_id)
        .maybeSingle();
      const { data: channel, error: channelError } = await supabase
        .from('channel_accounts')
        .select('provider, provider_account_id')
        .eq('id', message.channel_account_id)
        .eq('tenant_id', event.tenant_id)
        .maybeSingle();
      if (
        conversationError ||
        channelError ||
        !conversation ||
        !channel ||
        conversation.channel_account_id !== message.channel_account_id ||
        channel.provider !== 'zernio'
      ) {
        throw new ZernioDispatchError(false, 'outbox_channel_mismatch');
      }
      const providerConversationId = conversationIdFromReference(
        conversation.external_reference,
        channel.provider_account_id
      );
      if (!providerConversationId)
        throw new ZernioDispatchError(false, 'outbox_conversation_reference_invalid');

      await supabase
        .from('messages')
        .update({ status: 'sending' })
        .eq('id', message.id)
        .eq('tenant_id', event.tenant_id)
        .eq('status', 'queued');
      const dispatch = await this.dispatcher.send({
        accountId: channel.provider_account_id,
        body: message.body,
        conversationId: providerConversationId,
        idempotencyKey: message.idempotency_key
      });
      // Zernio may acknowledge a send with a messageId but without its optional sentAt.
      // In that case this is the local acknowledgement time, not a delivery/read receipt.
      const acknowledgedAt = new Date().toISOString();
      const { error: messageUpdateError } = await supabase
        .from('messages')
        .update({
          provider_message_id: messageReference(
            channel.provider_account_id,
            dispatch.providerMessageId
          ),
          sent_at: dispatch.sentAt ?? acknowledgedAt,
          status: 'sent'
        })
        .eq('id', message.id)
        .eq('tenant_id', event.tenant_id);
      if (messageUpdateError)
        throw new ZernioDispatchError(true, 'outbox_message_sent_update_failed');
      const { error: completedError } = await supabase
        .from('outbox_events')
        .update({ processed_at: acknowledgedAt, processing_started_at: null, state: 'completed' })
        .eq('id', event.id)
        .eq('state', 'processing');
      if (completedError) throw new ZernioDispatchError(true, 'outbox_completion_failed');
    } catch (error) {
      await this.fail(supabase, event, attempt, messageId, error);
    }
  }

  private async fail(
    supabase: SupabaseServerClient,
    event: OutboxEvent,
    attempt: number,
    messageId: string | null,
    error: unknown
  ): Promise<void> {
    const providerError =
      error instanceof ZernioDispatchError
        ? error
        : new ZernioDispatchError(true, 'zernio_dispatch_failed');
    const retry = providerError.retryable && attempt < 3;
    await supabase
      .from('outbox_events')
      .update(
        retry
          ? {
              available_at: retryAt(attempt),
              failure_code: providerError.code,
              processing_started_at: null,
              state: 'pending'
            }
          : {
              failure_code: providerError.code,
              processed_at: new Date().toISOString(),
              processing_started_at: null,
              state: 'failed'
            }
      )
      .eq('id', event.id)
      .eq('state', 'processing');
    if (messageId) {
      await supabase
        .from('messages')
        .update({ status: retry ? 'queued' : 'failed' })
        .eq('id', messageId)
        .eq('tenant_id', event.tenant_id);
    }
    console.error(
      JSON.stringify({ event: 'worker.outbox_dispatch_failed', failureCode: providerError.code })
    );
  }
}

export function createZernioOutboundWorker(
  environment: Record<string, string | undefined> = process.env
): ZernioOutboundWorker {
  const configuration = supabaseServerEnvironmentSchema.parse(environment);
  const apiKey = environment.ZERNIO_API_KEY;
  if (!apiKey) throw new Error('ZERNIO_API_KEY es obligatoria para el worker de salida.');
  return new ZernioOutboundWorker(
    () => createServerSupabaseClient(configuration),
    createZernioDispatcher(apiKey)
  );
}

export { conversationIdFromReference, messageReference };
