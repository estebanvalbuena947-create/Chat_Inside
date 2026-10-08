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
    for (const method of ['eq', 'is', 'order', 'select', 'update']) {
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
  options: { canManage?: boolean; catalog?: unknown; zernio?: unknown } = {}
) {
  const fake = createClientFake(responses);
  const assertRole = vi.fn(async () => {
    if (options.canManage === false) throw new Error('forbidden');
  });
  const service = new ZernioChannelService(
    { authenticate: async () => ({ userId }) } as never,
    { assertMembership: async () => undefined, assertRole } as never,
    { create: () => fake.client } as never,
    (options.zernio ?? {}) as never,
    (options.catalog ?? {}) as never
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
        disconnectedAt: null,
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
          disconnectedAt: null,
          displayName: 'Instagram ventas',
          id: channelId,
          platform: 'instagram'
        },
        {
          createdAt: '2026-09-28T21:00:00.000Z',
          disconnectedAt: null,
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

describe('ZernioChannelService plantillas de WhatsApp', () => {
  const item = {
    blockedReason: null,
    category: 'UTILITY',
    channelAccountIds: [channelId],
    language: 'es_MX',
    name: 'notificacion_48h',
    previewText: 'Hola, confirmamos tu reservacion.',
    sendable: true,
    status: 'APPROVED',
    variables: []
  };

  // El catalogo es quien resuelve cuentas y proveedor; este servicio autoriza y da forma.
  it('pide el catalogo del espacio al catalogo y no al proveedor directamente', async () => {
    const listForTenant = vi.fn(async () => [item]);
    const { service } = createService([], { catalog: { listForTenant } });

    await expect(service.listWhatsappTemplates('Bearer valid.jwt', tenantId)).resolves.toEqual({
      items: [item]
    });
    expect(listForTenant).toHaveBeenCalledWith(tenantId);
  });

  it('un espacio sin cuentas de WhatsApp devuelve una lista vacia y no un error', async () => {
    const listForTenant = vi.fn(async () => []);
    const { service } = createService([], { catalog: { listForTenant } });

    await expect(service.listWhatsappTemplates('Bearer valid.jwt', tenantId)).resolves.toEqual({
      items: []
    });
  });
});

describe('ZernioChannelService retirar y reconectar', () => {
  const canalRetirado = {
    created_at: '2026-09-28T20:00:00+00:00',
    disconnected_at: '2026-10-08T20:00:00.000Z',
    display_name: 'Inside Spa Mkt',
    id: channelId,
    platform: 'whatsapp'
  };

  it('desconecta en el proveedor y despues marca el canal', async () => {
    const disconnectAccount = vi.fn(async () => undefined);
    const { assertRole, service } = createService(
      [
        {
          data: { disconnected_at: null, id: channelId, provider_account_id: 'cuenta-wa' },
          error: null
        },
        { data: canalRetirado, error: null }
      ],
      { zernio: { disconnectAccount } }
    );

    await expect(service.disconnect('Bearer valid.jwt', tenantId, channelId)).resolves.toEqual({
      item: {
        createdAt: '2026-09-28T20:00:00.000Z',
        disconnectedAt: '2026-10-08T20:00:00.000Z',
        displayName: 'Inside Spa Mkt',
        id: channelId,
        platform: 'whatsapp'
      }
    });
    // El efecto externo va ANTES de marcar: si el proveedor falla, no se miente sobre el estado.
    expect(disconnectAccount).toHaveBeenCalledWith('cuenta-wa');
    expect(assertRole).toHaveBeenCalledWith(userId, tenantId, ['admin']);
  });

  it('no marca nada si el proveedor no acepta la desconexion', async () => {
    const disconnectAccount = vi.fn(async () => {
      throw new Error('Zernio no está disponible');
    });
    const { calls, service } = createService(
      [
        {
          data: { disconnected_at: null, id: channelId, provider_account_id: 'cuenta-wa' },
          error: null
        }
      ],
      { zernio: { disconnectAccount } }
    );

    await expect(service.disconnect('Bearer valid.jwt', tenantId, channelId)).rejects.toThrow(
      'Zernio no está disponible'
    );
    expect(calls.filter((call) => call.method === 'update')).toEqual([]);
  });

  it('retirar un canal exige ser administrador', async () => {
    const disconnectAccount = vi.fn();
    const { service } = createService([], { canManage: false, zernio: { disconnectAccount } });

    await expect(service.disconnect('Bearer valid.jwt', tenantId, channelId)).rejects.toThrow(
      'forbidden'
    );
    expect(disconnectAccount).not.toHaveBeenCalled();
  });

  it('un canal de otro espacio no se retira', async () => {
    const disconnectAccount = vi.fn();
    const { service } = createService([{ data: null, error: null }], {
      zernio: { disconnectAccount }
    });

    await expect(service.disconnect('Bearer valid.jwt', tenantId, channelId)).rejects.toThrow(
      'El canal no existe en este tenant.'
    );
    expect(disconnectAccount).not.toHaveBeenCalled();
  });

  it('reconectar devuelve la autorizacion del proveedor para esa plataforma', async () => {
    const getConnectUrl = vi.fn(async () => 'https://zernio.com/oauth/autorizar');
    process.env.ZERNIO_CONNECT_REDIRECT_URL = 'https://chat.insidespa.com.mx/';
    const { service } = createService(
      [
        { data: { id: channelId, platform: 'whatsapp' }, error: null },
        { data: { id: tenantId, zernio_profile_id: 'perfil-1' }, error: null }
      ],
      { zernio: { getConnectUrl } }
    );

    try {
      await expect(service.reconnect('Bearer valid.jwt', tenantId, channelId)).resolves.toEqual({
        authorizationUrl: 'https://zernio.com/oauth/autorizar'
      });
      expect(getConnectUrl).toHaveBeenCalledWith({
        platform: 'whatsapp',
        profileId: 'perfil-1',
        redirectUrl: 'https://chat.insidespa.com.mx/'
      });
    } finally {
      delete process.env.ZERNIO_CONNECT_REDIRECT_URL;
    }
  });

  it('una plataforma que el flujo de conexion no conoce no se reconecta', async () => {
    const getConnectUrl = vi.fn();
    process.env.ZERNIO_CONNECT_REDIRECT_URL = 'https://chat.insidespa.com.mx/';
    const { service } = createService(
      [{ data: { id: channelId, platform: 'metaads' }, error: null }],
      { zernio: { getConnectUrl } }
    );

    try {
      await expect(service.reconnect('Bearer valid.jwt', tenantId, channelId)).rejects.toThrow(
        'Ese canal no se reconecta desde aquí.'
      );
      expect(getConnectUrl).not.toHaveBeenCalled();
    } finally {
      delete process.env.ZERNIO_CONNECT_REDIRECT_URL;
    }
  });
});
