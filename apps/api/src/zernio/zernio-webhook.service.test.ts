import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { ZernioWebhookService, verifyZernioSignature } from './zernio-webhook.service';

const secret = 'test-webhook-secret';
const rawBody = Buffer.from(
  JSON.stringify({
    account: { id: 'zernio-account-1' },
    event: 'message.received',
    id: 'zernio-event-1'
  })
);

function signature(body: Buffer): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

function createService(options?: {
  account?: { tenant_id: string } | null;
  insertError?: unknown;
}) {
  const supabase = {
    from(table: string) {
      if (table === 'channel_accounts') {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          async maybeSingle() {
            return {
              data:
                options && 'account' in options
                  ? options.account
                  : { tenant_id: '11111111-1111-4111-8111-111111111111' },
              error: null
            };
          }
        };
      }

      return {
        async insert() {
          return { error: options?.insertError ?? null };
        }
      };
    }
  };

  return new ZernioWebhookService({ create: () => supabase } as never);
}

afterEach(() => {
  delete process.env.ZERNIO_WEBHOOK_SECRET;
});

describe('verifyZernioSignature', () => {
  it('accepts only the HMAC-SHA256 hex value for the exact raw body', () => {
    expect(verifyZernioSignature(rawBody, signature(rawBody), secret)).toBe(true);
    expect(verifyZernioSignature(Buffer.from('{}'), signature(rawBody), secret)).toBe(false);
    expect(verifyZernioSignature(rawBody, 'not-a-signature', secret)).toBe(false);
  });
});

describe('ZernioWebhookService', () => {
  it('stores a signed event for an explicitly associated channel account', async () => {
    process.env.ZERNIO_WEBHOOK_SECRET = secret;

    await expect(createService().receive(rawBody, signature(rawBody))).resolves.toEqual({
      duplicate: false
    });
  });

  it('does not accept a signed event from an unknown Zernio account', async () => {
    process.env.ZERNIO_WEBHOOK_SECRET = secret;

    await expect(
      createService({ account: null }).receive(rawBody, signature(rawBody))
    ).rejects.toThrow('no está asociada a un tenant');
  });

  it('accepts a database duplicate without treating it as a new event', async () => {
    process.env.ZERNIO_WEBHOOK_SECRET = secret;

    await expect(
      createService({ insertError: { code: '23505' } }).receive(rawBody, signature(rawBody))
    ).resolves.toEqual({ duplicate: true });
  });

  it('accepts the signed connectivity test without requiring an account map', async () => {
    process.env.ZERNIO_WEBHOOK_SECRET = secret;
    const testBody = Buffer.from(JSON.stringify({ event: 'webhook.test', id: 'test-event-1' }));

    await expect(createService().receive(testBody, signature(testBody))).resolves.toEqual({
      duplicate: false
    });
  });

  it('registers an account.connected event against the tenant profile without a copied account id', async () => {
    process.env.ZERNIO_WEBHOOK_SECRET = secret;
    const inserted: unknown[] = [];
    const supabase = {
      from(table: string) {
        if (table === 'tenants') {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            async maybeSingle() {
              return { data: { id: '11111111-1111-4111-8111-111111111111' }, error: null };
            }
          };
        }
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          async maybeSingle() {
            return { data: null, error: null };
          },
          async insert(value: unknown) {
            inserted.push(value);
            return { error: null };
          }
        };
      }
    };
    const service = new ZernioWebhookService({ create: () => supabase } as never);
    const connectedBody = Buffer.from(
      JSON.stringify({
        account: {
          accountId: 'zernio-new-account',
          platform: 'instagram',
          profileId: 'zernio-profile-1',
          username: 'inside.spa'
        },
        event: 'account.connected',
        id: 'zernio-connected-event-1'
      })
    );

    await expect(service.receive(connectedBody, signature(connectedBody))).resolves.toEqual({
      duplicate: false
    });
    expect(inserted).toEqual([
      {
        display_name: 'inside.spa',
        platform: 'instagram',
        provider: 'zernio',
        provider_account_id: 'zernio-new-account',
        tenant_id: '11111111-1111-4111-8111-111111111111'
      }
    ]);
  });
});
