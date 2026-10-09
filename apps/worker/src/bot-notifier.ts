import { signMediaPaths } from '@chat-zernio/media';
import type { SupabaseServerClient } from '@chat-zernio/config';

/**
 * Aviso al bot.
 *
 * Toma los avisos pendientes de la cola y los entrega al webhook de n8n, que es quien decide. En
 * modo sombra el bot NO envia nada: solo registra lo que habria respondido.
 *
 * Cinco decisiones:
 *   1. El cuerpo del mensaje NO se guarda en la cola: se lee al entregar. El contenido del cliente
 *      no se duplica en la base.
 *   2. La forma del aviso es un contrato estable, documentado aqui. Si cambia, cambia tambien la
 *      documentacion para n8n.
 *   3. Reintentar es seguro: la cola esta indexada por mensaje, y n8n recibe el mismo messageId, asi
 *      que puede deduplicar.
 *   4. Un espacio sin webhook configurado no es un error: se marca como omitido y se sigue.
 *   5. Los adjuntos viajan con su enlace firmado (10 minutos). El bot no puede pedirlos de otra
 *      forma: la ruta interna del almacen no sale nunca de la plataforma, y un comprobante que no
 *      llegue deja al cliente sin su validacion de pago.
 */

export const MAX_BOT_ATTEMPTS = 5;
export const BOT_DELIVERIES_PER_RUN = 25;
/** Deposito donde vive la copia propia de lo que manda el cliente. */
export const CONVERSATION_MEDIA_BUCKET = 'conversation-media';
/** Lo que dura el enlace firmado que viaja en el aviso. */
export const BOT_ATTACHMENT_URL_TTL_SECONDS = 600;

/** Si al aviso le quedan intentos. */
export function shouldRetryBotDelivery(attempts: number): boolean {
  return attempts < MAX_BOT_ATTEMPTS;
}

/**
 * Un adjunto del mensaje del cliente.
 *
 * `url` es un enlace firmado de corto plazo a NUESTRA copia; es `null` cuando el archivo todavia no
 * se ha podido copiar al almacen (el aviso llega igual: el texto puede bastar, y perder el aviso
 * entero por un archivo que aun no esta seria peor).
 */
export type InboundBotAttachment = {
  contentType: string | null;
  id: string;
  kind: string;
  title: string | null;
  url: string | null;
};

/** El aviso que recibe n8n. Esta es su forma, y es un contrato. */
export type InboundBotNotification = {
  conversation: {
    channelName: string | null;
    contactName: string | null;
    contactUsername: string | null;
    hasComment: boolean;
    hasDm: boolean;
    platform: string | null;
    status: string;
  };
  conversationId: string;
  event: 'message.inbound';
  message: {
    attachments: InboundBotAttachment[];
    body: string;
    commentState: string | null;
    direction: string;
    senderType: string;
    sentAt: string | null;
    source: string;
  };
  messageId: string;
  tenantId: string;
};

/** Construye el aviso. Funcion pura: se prueba sin base de datos ni red. */
export function buildInboundNotification(input: {
  conversation: {
    channelName?: string | null;
    contactName?: string | null;
    contactUsername?: string | null;
    hasComment?: boolean;
    hasDm?: boolean;
    id: string;
    platform?: string | null;
    status: string;
  };
  message: {
    attachments?: InboundBotAttachment[];
    body: string;
    commentState?: string | null;
    direction: string;
    id: string;
    senderType: string;
    sentAt?: string | null;
    source?: string | null;
  };
  tenantId: string;
}): InboundBotNotification {
  return {
    conversation: {
      channelName: input.conversation.channelName ?? null,
      contactName: input.conversation.contactName ?? null,
      contactUsername: input.conversation.contactUsername ?? null,
      hasComment: input.conversation.hasComment === true,
      hasDm: input.conversation.hasDm === true,
      platform: input.conversation.platform ?? null,
      status: input.conversation.status
    },
    conversationId: input.conversation.id,
    event: 'message.inbound',
    message: {
      attachments: input.message.attachments ?? [],
      body: input.message.body,
      commentState: input.message.commentState ?? null,
      direction: input.message.direction,
      senderType: input.message.senderType,
      sentAt: input.message.sentAt ?? null,
      source: input.message.source ?? 'dm'
    },
    messageId: input.message.id,
    tenantId: input.tenantId
  };
}

export type BotDeliveryOutcome =
  | { kind: 'sent'; messageId: string }
  | { kind: 'failed'; messageId: string; reason: string }
  | { kind: 'skipped'; messageId: string; reason: string };

type PendingDelivery = {
  attempts: number | null;
  conversation_id: string;
  id: string;
  message_id: string;
  tenant_id: string;
};

/** Entrega una tanda de avisos pendientes. El transporte llega por parametro, para poder probarlo. */
export async function sendPendingBotDeliveries(input: {
  deliver: (url: string, body: InboundBotNotification) => Promise<void>;
  supabase: SupabaseServerClient;
}): Promise<BotDeliveryOutcome[]> {
  const { data: pendientes, error } = await input.supabase
    .from('bot_deliveries')
    .select('id, tenant_id, message_id, conversation_id, attempts')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(BOT_DELIVERIES_PER_RUN);

  if (error || !Array.isArray(pendientes)) return [];

  const resultados: BotDeliveryOutcome[] = [];

  for (const fila of pendientes as PendingDelivery[]) {
    const intentos = fila.attempts ?? 0;

    const { data: integracion } = await input.supabase
      .from('bot_integrations')
      .select('webhook_url, enabled')
      .eq('tenant_id', fila.tenant_id)
      .maybeSingle();

    if (!integracion || integracion.enabled !== true || !integracion.webhook_url) {
      await input.supabase
        .from('bot_deliveries')
        .update({
          last_error: 'El bot no esta activo en este espacio.',
          status: 'skipped',
          updated_at: new Date().toISOString()
        })
        .eq('id', fila.id);
      resultados.push({
        kind: 'skipped',
        messageId: fila.message_id,
        reason: 'El bot no esta activo en este espacio.'
      });
      continue;
    }

    const { data: mensaje } = await input.supabase
      .from('messages')
      .select('id, body, direction, sender_type, sent_at, source, comment_state')
      .eq('id', fila.message_id)
      .maybeSingle();

    const { data: conversacion } = await input.supabase
      .from('conversations')
      .select(
        'id, status, has_dm, has_comment, contact:contacts(display_name, external_username), channel_account:channel_accounts(platform, display_name)'
      )
      .eq('id', fila.conversation_id)
      .maybeSingle();

    if (!mensaje || !conversacion) {
      await input.supabase
        .from('bot_deliveries')
        .update({
          last_error: 'El mensaje o la conversacion ya no existen.',
          status: 'skipped',
          updated_at: new Date().toISOString()
        })
        .eq('id', fila.id);
      resultados.push({
        kind: 'skipped',
        messageId: fila.message_id,
        reason: 'El mensaje o la conversacion ya no existen.'
      });
      continue;
    }

    const m = mensaje as Record<string, unknown>;
    const c = conversacion as Record<string, unknown>;
    const contacto = (c.contact ?? null) as Record<string, unknown> | null;
    const canal = (c.channel_account ?? null) as Record<string, unknown> | null;

    // Los adjuntos se leen al entregar y se firman en el momento: el enlace dura diez minutos, asi
    // que firmarlo al encolar lo dejaria caducado justo cuando el bot lo necesita.
    const adjuntos = await readAttachments(input.supabase, fila.message_id);

    const aviso = buildInboundNotification({
      conversation: {
        channelName: canal ? (canal.display_name as string | null) : null,
        contactName: contacto ? (contacto.display_name as string | null) : null,
        contactUsername: contacto ? (contacto.external_username as string | null) : null,
        hasComment: c.has_comment === true,
        hasDm: c.has_dm === true,
        id: String(c.id),
        platform: canal ? (canal.platform as string | null) : null,
        status: String(c.status ?? '')
      },
      message: {
        attachments: adjuntos,
        body: String(m.body ?? ''),
        commentState: (m.comment_state as string | null) ?? null,
        direction: String(m.direction ?? ''),
        id: String(m.id),
        senderType: String(m.sender_type ?? ''),
        sentAt: m.sent_at ? String(m.sent_at) : null,
        source: m.source ? String(m.source) : null
      },
      tenantId: fila.tenant_id
    });

    try {
      await input.deliver(String(integracion.webhook_url), aviso);
      await input.supabase
        .from('bot_deliveries')
        .update({
          attempts: intentos + 1,
          delivered_at: new Date().toISOString(),
          last_error: null,
          status: 'sent',
          updated_at: new Date().toISOString()
        })
        .eq('id', fila.id);
      resultados.push({ kind: 'sent', messageId: fila.message_id });
    } catch (error) {
      const motivo = error instanceof Error ? error.message : 'Fallo al avisar al bot.';
      await input.supabase
        .from('bot_deliveries')
        .update({
          attempts: intentos + 1,
          last_error: motivo,
          status: shouldRetryBotDelivery(intentos + 1) ? 'pending' : 'failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', fila.id);
      resultados.push({ kind: 'failed', messageId: fila.message_id, reason: motivo });
    }
  }

  return resultados;
}

/**
 * Los adjuntos del mensaje, con su enlace firmado.
 *
 * Reglas:
 *   1. Un fallo al firmar NO pierde el aviso: los adjuntos viajan con `url: null`. El bot puede
 *      responder al texto y pedir el archivo de nuevo; perder el turno entero seria peor.
 *   2. El orden es el del mensaje (`ordinal`): una misma imagen partida en dos capturas se lee en
 *      el orden en que el cliente la mando.
 *   3. Solo se firma lo que ya esta copiado: un adjunto sin archivo propio no tiene enlace.
 */
async function readAttachments(
  supabase: SupabaseServerClient,
  messageId: string
): Promise<InboundBotAttachment[]> {
  const { data, error } = await supabase
    .from('message_attachments')
    .select('id, kind, content_type, storage_object_path')
    .eq('message_id', messageId)
    .order('ordinal', { ascending: true });

  if (error || !Array.isArray(data)) return [];

  const filas = data as Array<Record<string, unknown>>;
  const rutas = filas
    .map((fila) => (typeof fila.storage_object_path === 'string' ? fila.storage_object_path : ''))
    .filter((ruta) => ruta.trim().length > 0);

  let firmadas = new Map<string, string>();
  try {
    firmadas = await signMediaPaths({
      bucket: CONVERSATION_MEDIA_BUCKET,
      paths: rutas,
      signer: supabase,
      ttlSeconds: BOT_ATTACHMENT_URL_TTL_SECONDS
    });
  } catch {
    firmadas = new Map();
  }

  return filas.map((fila) => {
    const ruta = typeof fila.storage_object_path === 'string' ? fila.storage_object_path : '';
    return {
      contentType: typeof fila.content_type === 'string' ? fila.content_type : null,
      id: String(fila.id),
      kind: String(fila.kind ?? 'file'),
      title: null,
      url: ruta ? (firmadas.get(ruta) ?? null) : null
    };
  });
}

/** Transporte real: entrega el aviso al webhook de n8n. */ export function createBotTransport(): (
  url: string,
  body: InboundBotNotification
) => Promise<void> {
  return async (url: string, body: InboundBotNotification) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, {
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error('El bot respondio ' + String(response.status) + '.');
      }
    } finally {
      clearTimeout(timeout);
    }
  };
}
