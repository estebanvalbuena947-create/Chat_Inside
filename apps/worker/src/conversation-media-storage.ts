import type { SupabaseServerClient } from '@chat-zernio/config';
import { storeRemoteMedia, supabaseMediaStorage } from '@chat-zernio/media';

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
  // El motor y la subida viven en @chat-zernio/media, compartidos con los avatares y con la
  // multimedia de sede. Aqui solo se decide el bucket y la ruta.
  const guardado = await storeRemoteMedia({
    bucket: mediaBucket,
    maxBytes: maxMediaBytes,
    path: (media) =>
      `${input.tenantId}/${input.conversationId}/${input.messageId}/${input.ordinal}.${media.extension}`,
    sourceUrl: input.sourceUrl,
    storage: supabaseMediaStorage(input.supabase),
    timeoutMs: downloadTimeoutMs
  });
  if (!guardado) return null;

  return { byteSize: guardado.byteSize, contentType: guardado.contentType, path: guardado.path };
}
