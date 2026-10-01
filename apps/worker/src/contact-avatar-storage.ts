import { createHash } from 'node:crypto';
import type { SupabaseServerClient } from '@chat-zernio/config';
import { fetchRemoteMedia } from './remote-media';

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
  const media = await fetchRemoteMedia({
    maxBytes: maxAvatarBytes,
    sourceUrl: input.sourceUrl,
    timeoutMs: 10_000
  });
  // El avatar solo admite imagen: cualquier otro contenido se descarta sin escribirlo.
  if (!media || !media.contentType.startsWith('image/')) return null;

  const path = `${input.tenantId}/${input.contactId}/${input.sourceHash}.${media.extension}`;
  const { error } = await input.supabase.storage.from(avatarBucket).upload(path, media.bytes, {
    contentType: media.contentType,
    upsert: true
  });
  return error ? null : path;
}
