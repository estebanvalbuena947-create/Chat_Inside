import { createHash } from 'node:crypto';
import type { SupabaseServerClient } from '@chat-zernio/config';
import { storeRemoteMedia, supabaseMediaStorage } from '@chat-zernio/media';

const avatarBucket = 'contact-avatars';
const maxAvatarBytes = 2 * 1024 * 1024;

export function avatarSourceHash(sourceUrl: string): string {
  return createHash('sha256').update(sourceUrl).digest('hex');
}

export async function storeContactAvatar(input: {
  contactId: string;
  sourceHash: string;
  sourceUrl: string;
  supabase: SupabaseServerClient;
  tenantId: string;
}): Promise<string | null> {
  const guardado = await storeRemoteMedia({
    // El avatar solo admite imagen: cualquier otro contenido se descarta sin escribirlo. Es el
    // filtro que la pieza compartida deja decidir a quien llama, porque cambia en cada caso.
    accept: (media) => media.contentType.startsWith('image/'),
    bucket: avatarBucket,
    maxBytes: maxAvatarBytes,
    path: (media) => `${input.tenantId}/${input.contactId}/${input.sourceHash}.${media.extension}`,
    sourceUrl: input.sourceUrl,
    storage: supabaseMediaStorage(input.supabase),
    timeoutMs: 10_000
  });
  return guardado ? guardado.path : null;
}
