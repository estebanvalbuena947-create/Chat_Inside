import type { SupabaseServerClient } from '@chat-zernio/config';
import { fetchRemoteMedia } from './remote-media';

const mediaBucket = 'conversation-media';
const maxMediaBytes = 25 * 1024 * 1024;
const downloadTimeoutMs = 20_000;

export type StoredConversationMedia = {
  byteSize: number;
  contentType: string;
  path: string;
};

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
}): Promise<StoredConversationMedia | null> {
  const media = await fetchRemoteMedia({
    maxBytes: maxMediaBytes,
    sourceUrl: input.sourceUrl,
    timeoutMs: downloadTimeoutMs
  });
  if (!media) return null;

  const path = `${input.tenantId}/${input.conversationId}/${input.messageId}/${input.ordinal}.${media.extension}`;
  const { error } = await input.supabase.storage.from(mediaBucket).upload(path, media.bytes, {
    contentType: media.contentType,
    upsert: true
  });
  if (error) return null;

  return { byteSize: media.bytes.length, contentType: media.contentType, path };
}
