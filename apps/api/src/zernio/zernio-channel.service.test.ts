import { describe, expect, it, vi } from 'vitest';
import { ZernioChannelService } from './zernio-channel.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const channelId = '33333333-3333-4333-8333-333333333333';

type RecordedCall = { args: unknown[]; method: string };

function createClientFake(responses: Array<{ data: unknown; error: unknown }>) {
  const calls: RecordedCall[] = [];
  let index = 0;
  const from = vi.fn(() => {
    const builder: Record<string, unknown> = {};
    for (const method of ['eq', 'order', 'select', 'update']) {
      builder[method] = (...args: unknown[]) => {
        calls.push({ args, method });
        return builder;
      };
    }
    builder.maybeSingle = () => Promise.resolve(responses[index++] ?? { data: null, error: null });
    builder.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(responses[index++] ?? { data: null, error: null }).then(resolve);
    return builder;
  });

  return { calls, client: { from } };
}

function createService(
  responses: Array<{ data: unknown; error: unknown }>,
  options: { canManage?: boolean } = {}
) {
  const fake = createClientFake(responses);
  const assertRole = vi.fn(async () => {
    if (options.canManage === false) throw new Error('forbidden');
  });
  const service = new ZernioChannelService(
    { authenticate: async () => ({ userId }) } as never,
    { assertMembership: async () => undefined, assertRole } as never,
    { create: () => fake.client } as never,
    {} as never
  );

  return { assertRole, calls: fake.calls, service };
}

describe('ZernioChannelService rename', () => {
  it('names a channel for an administrator, scoped to the tenant and provider', async () => {
    const { assertRole, calls, service } = createService([
      {
        data: {
          created_at: '2026-09-28T20:00:00+00:00',
          display_name: 'Instagram ventas',
          id: channelId,
          platform: 'instagram'
        },
        error: null
      }
    ]);

    await expect(
      service.rename('Bearer valid.jwt', tenantId, channelId, { displayName: 'Instagram ventas' })
    ).resolves.toEqual({
      item: {
        createdAt: '2026-09-28T20:00:00.000Z',
        displayName: 'Instagram ventas',
        id: channelId,
        platform: 'instagram'
      }
    });

    expect(assertRole).toHaveBeenCalledWith(userId, tenantId, ['admin']);
    expect(calls).toEqual(
      expect.arrayContaining([
        { args: [{ display_name: 'Instagram ventas' }], method: 'update' },
        { args: ['tenant_id', tenantId], method: 'eq' },
        { args: ['provider', 'zernio'], method: 'eq' },
        { args: ['id', channelId], method: 'eq' }
      ])
    );
  });

  it('rejects a rename from someone who is not an administrator', async () => {
    const { calls, service } = createService([], { canManage: false });

    await expect(
      service.rename('Bearer valid.jwt', tenantId, channelId, { displayName: 'Otro nombre' })
    ).rejects.toThrow('forbidden');
    expect(calls).toHaveLength(0);
  });

  it('fails visibly when the channel does not belong to the tenant', async () => {
    const { service } = createService([{ data: null, error: null }]);

    await expect(
      service.rename('Bearer valid.jwt', tenantId, channelId, { displayName: 'Otro nombre' })
    ).rejects.toThrow('El canal no existe en este tenant.');
  });

  it('fails visibly when the rename cannot be stored', async () => {
    const { service } = createService([{ data: null, error: { message: 'boom' } }]);

    await expect(
      service.rename('Bearer valid.jwt', tenantId, channelId, { displayName: 'Otro nombre' })
    ).rejects.toThrow('No fue posible nombrar el canal.');
  });
});

describe('ZernioChannelService list', () => {
  it('lists the connected channels without exposing provider identifiers', async () => {
    const { calls, service } = createService([
      {
        data: [
          {
            created_at: '2026-09-28T20:00:00+00:00',
            display_name: 'Instagram ventas',
            id: channelId,
            platform: 'instagram'
          },
          {
            created_at: '2026-09-28T21:00:00+00:00',
            display_name: null,
            id: '44444444-4444-4444-8444-444444444444',
            platform: null
          }
        ],
        error: null
      }
    ]);

    await expect(service.list('Bearer valid.jwt', tenantId)).resolves.toEqual({
      items: [
        {
          createdAt: '2026-09-28T20:00:00.000Z',
          displayName: 'Instagram ventas',
          id: channelId,
          platform: 'instagram'
        },
        {
          createdAt: '2026-09-28T21:00:00.000Z',
          displayName: null,
          id: '44444444-4444-4444-8444-444444444444',
          platform: null
        }
      ]
    });

    expect(calls.some((call) => call.method === 'select')).toBe(true);
    expect(calls.find((call) => call.method === 'select')?.args[0]).not.toContain(
      'provider_account_id'
    );
  });
});
