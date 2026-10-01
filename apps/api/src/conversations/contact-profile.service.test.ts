import { describe, expect, it } from 'vitest';
import { ContactProfileService } from './contact-profile.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const contactId = '22222222-2222-4222-8222-222222222222';

function createService(options?: { avatarPath?: string | null; canAccess?: boolean }) {
  const query = {
    eq() {
      return this;
    },
    async maybeSingle() {
      return {
        data: {
          avatar_object_path:
            options && 'avatarPath' in options ? options.avatarPath : 'tenant/contact/avatar.jpg'
        },
        error: null
      };
    },
    select() {
      return this;
    }
  };
  const supabase = {
    from() {
      return query;
    },
    storage: {
      from() {
        return {
          async createSignedUrl() {
            return {
              data: { signedUrl: 'https://storage.example.test/signed-avatar' },
              error: null
            };
          }
        };
      }
    }
  };
  return new ContactProfileService(
    { authenticate: async () => ({ userId: 'user-1' }) } as never,
    {
      assertMembership: async () => {
        if (options?.canAccess === false) throw new Error('forbidden');
      }
    } as never,
    { create: () => supabase } as never
  );
}

describe('ContactProfileService', () => {
  it('issues a short-lived avatar URL only after tenant membership is confirmed', async () => {
    await expect(
      createService().createAvatarUrl('Bearer token', tenantId, contactId)
    ).resolves.toEqual({
      url: 'https://storage.example.test/signed-avatar'
    });
  });

  it('does not return an avatar when the caller cannot access the tenant', async () => {
    await expect(
      createService({ canAccess: false }).createAvatarUrl('Bearer token', tenantId, contactId)
    ).rejects.toThrow('forbidden');
  });

  it('does not create a signed URL when the contact has no stored avatar', async () => {
    await expect(
      createService({ avatarPath: null }).createAvatarUrl('Bearer token', tenantId, contactId)
    ).rejects.toThrow('no tiene avatar');
  });
});
