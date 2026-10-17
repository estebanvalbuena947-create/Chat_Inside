import type { SupabaseServerClient } from '@chat-zernio/config';
import {
  recognizeMedia,
  storeRemoteMedia,
  supabaseMediaStorage,
  type RemoteFile
} from '@chat-zernio/media';

const mediaBucket = 'conversation-media';
const maxMediaBytes = 25 * 1024 * 1024;
const downloadTimeoutMs = 20_000;

export type StoredConversationMedia = {
  byteSize: number;
  contentType: string;
  path: string;
};

/** WhatsApp exposes incoming media through an authenticated Zernio endpoint, not a public CDN. */
export async function fetchZernioWhatsappMedia(input: {
  accountId: string;
  maxBytes: number;
  mediaId: string;
  timeoutMs: number;
}): Promise<RemoteFile | null> {
  const apiKey = process.env.ZERNIO_API_KEY;
  if (!apiKey) return null;

  const endpoint = new URL(
    `https://zernio.com/api/v1/whatsapp/media/${encodeURIComponent(input.mediaId)}`
  );
  endpoint.searchParams.set('accountId', input.accountId);
  try {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${apiKey}` },
      redirect: 'error',
      signal: AbortSignal.timeout(input.timeoutMs)
    });
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (!response.ok || (Number.isFinite(declaredLength) && declaredLength > input.maxBytes)) {
      return null;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > input.maxBytes) return null;
    const recognized = recognizeMedia(bytes);
    return recognized ? { bytes, ...recognized } : null;
  } catch {
    return null;
  }
}

/**
 * Copia al almacenamiento propio un archivo que el contacto envio por el canal.
 *
 * El enlace del proveedor es firmado y caduca en dias, por eso se descarga ahora. Devolver
 * `null` es un resultado esperado: el mensaje se conserva aunque su multimedia no se pueda
 * copiar, y la fila queda marcada para saber que falta.
 */
export async function storeConversationMedia(input: {
  conversationId: string;
  messageId: string;
  ordinal: number;
  sourceUrl: string;
  supabase: SupabaseServerClient;
  tenantId: string;
  zernioWhatsapp?: { accountId: string; mediaId: string };
}): Promise<StoredConversationMedia | null> {
  // El motor y la subida viven en @chat-zernio/media, compartidos con los avatares y con la
  // multimedia de sede. Aqui solo se decide el bucket y la ruta.
  const zernioWhatsapp = input.zernioWhatsapp;
  const guardado = await storeRemoteMedia({
    bucket: mediaBucket,
    maxBytes: maxMediaBytes,
    path: (media) =>
      `${input.tenantId}/${input.conversationId}/${input.messageId}/${input.ordinal}.${media.extension}`,
    sourceUrl: input.sourceUrl,
    fetchMedia: zernioWhatsapp
      ? ({ maxBytes, timeoutMs }) =>
          fetchZernioWhatsappMedia({ ...zernioWhatsapp, maxBytes, timeoutMs })
      : undefined,
    storage: supabaseMediaStorage(input.supabase),
    timeoutMs: downloadTimeoutMs
  });
  if (!guardado) return null;

  return { byteSize: guardado.byteSize, contentType: guardado.contentType, path: guardado.path };
}
