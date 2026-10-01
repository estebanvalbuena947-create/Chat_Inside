import { describe, expect, it } from 'vitest';
import { avatarSourceHash, storeContactAvatar } from './contact-avatar-storage';

describe('contact avatar storage', () => {
  it('uses a deterministic opaque hash for a provider source URL', () => {
    expect(avatarSourceHash('https://cdn.example.test/a.jpg')).toHaveLength(64);
    expect(avatarSourceHash('https://cdn.example.test/a.jpg')).toBe(
      avatarSourceHash('https://cdn.example.test/a.jpg')
    );
  });

  it('rejects a loopback avatar URL before making a download request', async () => {
    await expect(
      storeContactAvatar({
        contactId: 'contact-1',
        sourceHash: 'a'.repeat(64),
        sourceUrl: 'https://127.0.0.1/avatar.jpg',
        supabase: {} as never,
        tenantId: 'tenant-1'
      })
    ).resolves.toBeNull();
  });
});
