import type { SupabaseServerClient } from '@chat-zernio/config';
import { repairMojibake } from '@chat-zernio/domain';
import { storeConversationMedia } from './conversation-media-storage';

/** Cada cuanto se revisa si quedaron copias pendientes. */
export const MEDIA_REPAIR_INTERVAL_MS = 5 * 60_000;
/** Tope de intentos por adjunto: un enlace caducado no puede reintentarse sin fin. */
export const MEDIA_MAX_ATTEMPTS = 5;
/** Espera entre intentos del mismo adjunto. */
export const MEDIA_RETRY_BACKOFF_MS = 10 * 60_000;
const BATCH_SIZE = 20;

export function isMediaRepairDue(lastRunAt: number, now: number): boolean {
  return now - lastRunAt >= MEDIA_REPAIR_INTERVAL_MS;
}

type PendingAttachment = {
  conversation_id: string;
  download_attempts: number;
  download_failed_at: string | null;
  id: string;
  kind: string;
  message_id: string;
  ordinal: number;
  source_title: string | null;
  source_url: string | null;
  tenant_id: string;
};

function isDueForRetry(row: PendingAttachment, now: number): boolean {
  if (row.download_attempts >= MEDIA_MAX_ATTEMPTS) return false;
  if (!row.download_failed_at) return true;
  const failedAt = new Date(row.download_failed_at).getTime();
  return Number.isNaN(failedAt) || now - failedAt >= MEDIA_RETRY_BACKOFF_MS;
}

/**
 * Recupera el texto de una publicacion compartida que se guardo antes de que el sistema
 * supiera leerlo. El payload original sigue almacenado, asi que el contexto no se pierde.
 */
async function recoverShareContext(
  supabase: SupabaseServerClient,
  row: PendingAttachment
): Promise<{ sourceKind: string | null; title: string } | null> {
  const { data: message, error: messageError } = await supabase
    .from('messages')
    .select('provider_message_id')
    .eq('id', row.message_id)
    .eq('tenant_id', row.tenant_id)
    .maybeSingle();
  if (messageError || !message?.provider_message_id) return null;

  const providerMessageId = String(message.provider_message_id).split(':').at(-1);
  if (!providerMessageId) return null;

  const { data: event, error: eventError } = await supabase
    .from('webhook_events')
    .select('payload')
    .eq('tenant_id', row.tenant_id)
    .eq('payload->message->>id', providerMessageId)
    .limit(1)
    .maybeSingle();
  if (eventError || !event?.payload) return null;

  const payload = event.payload as { message?: { attachments?: unknown } };
  const attachments = Array.isArray(payload.message?.attachments)
    ? payload.message?.attachments
    : [];
  const attachment = attachments[row.ordinal];
  if (!attachment || typeof attachment !== 'object') return null;

  const entry = attachment as { originalType?: unknown; payload?: unknown };
  const title =
    entry.payload && typeof entry.payload === 'object'
      ? (entry.payload as { title?: unknown }).title
      : null;
  if (typeof title !== 'string' || !title.trim()) return null;

  return {
    sourceKind: typeof entry.originalType === 'string' ? entry.originalType.slice(0, 64) : null,
    title: repairMojibake(title).slice(0, 4000)
  };
}

/**
 * Pasada de reintento: copia la multimedia que quedo pendiente y recupera el texto de las
 * publicaciones compartidas guardadas antes de que supiéramos leerlo.
 *
 * Nunca lanza: un fallo se anota en la fila y el mensaje permanece intacto.
 */
export async function repairPendingMedia(
  supabase: SupabaseServerClient,
  now: number = Date.now()
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('message_attachments')
      .select(
        'id, tenant_id, conversation_id, message_id, ordinal, kind, source_url, source_title, download_attempts, download_failed_at'
      )
      .is('storage_object_path', null)
      .lt('download_attempts', MEDIA_MAX_ATTEMPTS)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);
    if (error || !data) {
      console.error(JSON.stringify({ event: 'worker.media_repair_lookup_failed' }));
      return 0;
    }

    let repaired = 0;
    for (const raw of data) {
      const row = raw as PendingAttachment;
      if (!isDueForRetry(row, now)) continue;

      const update: Record<string, unknown> = {
        download_attempts: row.download_attempts + 1
      };

      if (!row.source_title) {
        const context = await recoverShareContext(supabase, row);
        if (context) {
          update.source_kind = context.sourceKind;
          update.source_title = context.title;
        }
      }

      const stored = row.source_url
        ? await storeConversationMedia({
            conversationId: row.conversation_id,
            messageId: row.message_id,
            ordinal: row.ordinal,
            sourceUrl: row.source_url,
            supabase,
            tenantId: row.tenant_id
          })
        : null;

      if (stored) {
        update.byte_size = stored.byteSize;
        update.content_type = stored.contentType;
        update.downloaded_at = new Date(now).toISOString();
        update.download_failed_at = null;
        update.storage_object_path = stored.path;
      } else {
        update.download_failed_at = new Date(now).toISOString();
      }

      const { error: updateError } = await supabase
        .from('message_attachments')
        .update(update)
        .eq('id', row.id)
        .eq('tenant_id', row.tenant_id);
      if (updateError) {
        console.error(JSON.stringify({ event: 'worker.media_repair_update_failed' }));
        continue;
      }
      if (stored) repaired += 1;
    }

    if (repaired > 0) {
      console.log(JSON.stringify({ event: 'worker.media_repaired', repaired }));
    }
    return repaired;
  } catch {
    console.error(JSON.stringify({ event: 'worker.media_repair_failed' }));
    return 0;
  }
}
