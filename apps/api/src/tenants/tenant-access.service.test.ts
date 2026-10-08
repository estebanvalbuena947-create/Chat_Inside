import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TenantAccessService } from './tenant-access.service';

const userId = '22222222-2222-4222-8222-222222222222';
const tenantId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '33333333-3333-4333-8333-333333333333';

type FakeResponse = { data: unknown; error: unknown };
type RecordedCall = { args: unknown[]; method: string };

/**
 * Cliente falso por tabla: cada consulta recibe la siguiente respuesta preparada para esa
 * tabla, y se registra la cadena completa para poder afirmar la forma de la escritura.
 */
function createTeamFake(responses: Record<string, FakeResponse[]>) {
  const builders: Record<string, RecordedCall[][]> = {};
  const cursors: Record<string, number> = {};

  function nextResponse(table: string): FakeResponse {
    const queue = responses[table] ?? [];
    const index = cursors[table] ?? 0;
    cursors[table] = index + 1;
    return queue[index] ?? { data: null, error: null };
  }

  const from = vi.fn((table: string) => {
    builders[table] = builders[table] ?? [];
    const recorded: RecordedCall[] = [];
    builders[table].push(recorded);
    const builder: Record<string, unknown> = {};
    for (const method of ['delete', 'eq', 'insert', 'limit', 'neq', 'select', 'update']) {
      builder[method] = (...args: unknown[]) => {
        recorded.push({ args, method });
        return builder;
      };
    }
    builder.maybeSingle = () => Promise.resolve(nextResponse(table));
    builder.then = (resolve: (value: FakeResponse) => unknown) =>
      Promise.resolve(nextResponse(table)).then(resolve);
    return builder;
  });

  return {
    callsIn: (table: string, method: string) =>
      (builders[table] ?? []).flatMap((recorded) =>
        recorded.filter((call) => call.method === method).map((call) => call.args)
      ),
    client: { auth: { admin: {} }, from },
    from
  };
}

function createTeamService(client: unknown): TenantAccessService {
  return new TenantAccessService(
    { authenticate: async () => ({ userId }) } as never,
    { create: () => client } as never
  );
}

describe('TenantAccessService invitations', () => {
  it('invites a new person with the requested role and returns a one-time link', async () => {
    const fake = createTeamFake({
      memberships: [
        { data: { role: 'admin' }, error: null },
        { data: null, error: null }
      ]
    });
    const generateLink = vi.fn().mockResolvedValue({
      data: {
        properties: { action_link: 'https://proyecto.supabase.co/verify?token=abc' },
        user: { id: otherUserId }
      },
      error: null
    });
    (fake.client as unknown as { auth: { admin: unknown; signInWithOtp?: unknown } }).auth = {
      admin: {
        generateLink
      },
      signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null })
    };

    await expect(
      createTeamService(fake.client).inviteMember('Bearer valid.jwt', tenantId, {
        email: 'Nueva.Persona@Example.com',
        role: 'supervisor'
      })
    ).resolves.toEqual({
      item: {
        email: 'nueva.persona@example.com',
        inviteLink: 'https://proyecto.supabase.co/verify?token=abc',
        requiresPassword: true,
        role: 'supervisor'
      }
    });

    expect(generateLink).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'nueva.persona@example.com', type: 'invite' })
    );
    expect(generateLink).toHaveBeenCalledTimes(1);
    expect(fake.callsIn('memberships', 'insert')).toContainEqual([
      { role: 'supervisor', tenant_id: tenantId, user_id: otherUserId }
    ]);
  });

  it('never changes the role of someone who is already a member', async () => {
    const fake = createTeamFake({
      memberships: [
        { data: { role: 'admin' }, error: null },
        { data: { role: 'agent' }, error: null }
      ]
    });
    const generateLink = vi.fn().mockResolvedValue({
      data: {
        properties: { action_link: 'https://proyecto.supabase.co/verify?token=abc' },
        user: { id: otherUserId }
      },
      error: null
    });
    (fake.client as unknown as { auth: { admin: unknown; signInWithOtp?: unknown } }).auth = {
      admin: {
        generateLink
      },
      signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null })
    };

    await expect(
      createTeamService(fake.client).inviteMember('Bearer valid.jwt', tenantId, {
        email: 'ya.existe@example.com',
        role: 'admin'
      })
    ).resolves.toEqual({
      item: {
        email: 'ya.existe@example.com',
        inviteLink: 'https://proyecto.supabase.co/verify?token=abc',
        requiresPassword: true,
        role: 'agent'
      }
    });

    expect(fake.callsIn('memberships', 'insert')).toHaveLength(0);
  });

  it('hands an access link to an existing account instead of inviting it again', async () => {
    const fake = createTeamFake({
      memberships: [
        { data: { role: 'admin' }, error: null },
        { data: null, error: null }
      ]
    });
    const generateLink = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: 'already registered' } })
      .mockResolvedValueOnce({
        data: {
          properties: { action_link: 'https://proyecto.supabase.co/verify?token=login' },
          user: { id: otherUserId }
        },
        error: null
      });
    (fake.client as unknown as { auth: { admin: unknown; signInWithOtp?: unknown } }).auth = {
      admin: {
        generateLink
      },
      signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null })
    };

    await expect(
      createTeamService(fake.client).inviteMember('Bearer valid.jwt', tenantId, {
        email: 'cuenta.existente@example.com',
        role: 'agent'
      })
    ).resolves.toEqual({
      item: {
        email: 'cuenta.existente@example.com',
        inviteLink: 'https://proyecto.supabase.co/verify?token=login',
        requiresPassword: false,
        role: 'agent'
      }
    });

    expect(generateLink).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: 'invite' }));
    expect(generateLink).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: 'magiclink' }));
    expect(generateLink).toHaveBeenCalledTimes(2);
  });

  it('refuses to invite when the caller is not an administrator', async () => {
    const fake = createTeamFake({ memberships: [{ data: { role: 'agent' }, error: null }] });
    const generateLink = vi.fn();
    (fake.client as unknown as { auth: { admin: unknown; signInWithOtp?: unknown } }).auth = {
      admin: {
        generateLink
      },
      signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null })
    };

    await expect(
      createTeamService(fake.client).inviteMember('Bearer valid.jwt', tenantId, {
        email: 'persona@example.com',
        role: 'agent'
      })
    ).rejects.toThrow(ForbiddenException);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it('fails visibly when no link can be generated', async () => {
    const fake = createTeamFake({
      memberships: [{ data: { role: 'admin' }, error: null }]
    });
    const generateLink = vi.fn().mockResolvedValue({ data: null, error: { message: 'nope' } });
    (fake.client as unknown as { auth: { admin: unknown; signInWithOtp?: unknown } }).auth = {
      admin: {
        generateLink
      },
      signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null })
    };

    await expect(
      createTeamService(fake.client).inviteMember('Bearer valid.jwt', tenantId, {
        email: 'persona@example.com',
        role: 'agent'
      })
    ).rejects.toThrow('No fue posible generar la invitación.');
  });
});

describe('TenantAccessService member administration', () => {
  it('changes the role of a member of the same tenant', async () => {
    const fake = createTeamFake({
      memberships: [
        { data: { role: 'admin' }, error: null },
        { data: { role: 'agent' }, error: null },
        { data: null, error: null }
      ]
    });
    const getUserById = vi
      .fn()
      .mockResolvedValue({ data: { user: { email: 'agente@example.com' } }, error: null });
    (fake.client as unknown as { auth: { admin: unknown; signInWithOtp?: unknown } }).auth = {
      admin: { getUserById }
    };

    await expect(
      createTeamService(fake.client).updateMemberRole('Bearer valid.jwt', tenantId, otherUserId, {
        role: 'supervisor'
      })
    ).resolves.toEqual({
      item: {
        displayName: null,
        email: 'agente@example.com',
        role: 'supervisor',
        userId: otherUserId
      }
    });

    expect(fake.callsIn('memberships', 'update')).toContainEqual([{ role: 'supervisor' }]);
    expect(fake.callsIn('memberships', 'eq')).toEqual(
      expect.arrayContaining([
        ['tenant_id', tenantId],
        ['user_id', otherUserId]
      ])
    );
  });

  it('refuses to leave the tenant without an administrator', async () => {
    const fake = createTeamFake({
      memberships: [
        { data: { role: 'admin' }, error: null },
        { data: { role: 'admin' }, error: null },
        { data: [], error: null }
      ]
    });

    await expect(
      createTeamService(fake.client).updateMemberRole('Bearer valid.jwt', tenantId, otherUserId, {
        role: 'agent'
      })
    ).rejects.toThrow(ConflictException);
    expect(fake.callsIn('memberships', 'update')).toHaveLength(0);
  });

  it('allows demoting an administrator when another one remains', async () => {
    const fake = createTeamFake({
      memberships: [
        { data: { role: 'admin' }, error: null },
        { data: { role: 'admin' }, error: null },
        { data: [{ user_id: userId }], error: null },
        { data: null, error: null }
      ]
    });
    const getUserById = vi
      .fn()
      .mockResolvedValue({ data: { user: { email: 'otro.admin@example.com' } }, error: null });
    (fake.client as unknown as { auth: { admin: unknown; signInWithOtp?: unknown } }).auth = {
      admin: { getUserById }
    };

    await expect(
      createTeamService(fake.client).updateMemberRole('Bearer valid.jwt', tenantId, otherUserId, {
        role: 'supervisor'
      })
    ).resolves.toEqual({
      item: {
        displayName: null,
        email: 'otro.admin@example.com',
        role: 'supervisor',
        userId: otherUserId
      }
    });
  });

  it('removes a member without deleting their account', async () => {
    const fake = createTeamFake({
      memberships: [
        { data: { role: 'admin' }, error: null },
        { data: { role: 'agent' }, error: null },
        { data: null, error: null }
      ]
    });

    await expect(
      createTeamService(fake.client).removeMember('Bearer valid.jwt', tenantId, otherUserId)
    ).resolves.toEqual({ item: { userId: otherUserId } });

    expect(fake.callsIn('memberships', 'delete')).toHaveLength(1);
    expect(fake.callsIn('memberships', 'eq')).toEqual(
      expect.arrayContaining([
        ['tenant_id', tenantId],
        ['user_id', otherUserId]
      ])
    );
  });

  it('refuses to remove the last administrator', async () => {
    const fake = createTeamFake({
      memberships: [
        { data: { role: 'admin' }, error: null },
        { data: { role: 'admin' }, error: null },
        { data: [], error: null }
      ]
    });

    await expect(
      createTeamService(fake.client).removeMember('Bearer valid.jwt', tenantId, otherUserId)
    ).rejects.toThrow(ConflictException);
    expect(fake.callsIn('memberships', 'delete')).toHaveLength(0);
  });

  it('does not touch a member of another tenant', async () => {
    const fake = createTeamFake({
      memberships: [
        { data: { role: 'admin' }, error: null },
        { data: null, error: null }
      ]
    });

    await expect(
      createTeamService(fake.client).removeMember('Bearer valid.jwt', tenantId, otherUserId)
    ).rejects.toThrow('El integrante no existe en este tenant.');
    expect(fake.callsIn('memberships', 'delete')).toHaveLength(0);
  });
});

function createService({
  membership,
  memberships
}: {
  membership: unknown;
  memberships: unknown[];
}) {
  const supabase = {
    from() {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async maybeSingle() {
          return { data: membership, error: null };
        },
        then(resolve: (value: { data: unknown[]; error: null }) => unknown) {
          return Promise.resolve({ data: memberships, error: null }).then(resolve);
        }
      };
    }
  };

  return new TenantAccessService(
    { authenticate: async () => ({ userId }) } as never,
    { create: () => supabase } as never
  );
}

describe('TenantAccessService', () => {
  it('rejects access when the authenticated user has no membership', async () => {
    await expect(
      createService({ membership: null, memberships: [] }).assertMembership(userId, tenantId)
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns only the tenants available to the authenticated user', async () => {
    const service = createService({
      membership: { role: 'agent' },
      memberships: [
        {
          role: 'admin',
          tenant: { id: tenantId, name: 'Inside Spa', slug: 'inside-spa' }
        }
      ]
    });

    await expect(service.listAccessibleTenants('Bearer valid.jwt')).resolves.toEqual({
      items: [{ id: tenantId, name: 'Inside Spa', role: 'admin', slug: 'inside-spa' }]
    });
  });

  it('rejects an agent when a command requires an administrator role', async () => {
    await expect(
      createService({ membership: { role: 'agent' }, memberships: [] }).assertRole(
        userId,
        tenantId,
        ['admin']
      )
    ).rejects.toThrow(ForbiddenException);
  });

  it('lists only members of the verified tenant and exposes only their role and email label', async () => {
    const accessQuery = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'agent' }, error: null }),
      select: vi.fn().mockReturnThis()
    };
    const membersQuery = {
      eq: vi.fn().mockResolvedValue({
        data: [{ role: 'supervisor', user_id: '33333333-3333-4333-8333-333333333333' }],
        error: null
      }),
      select: vi.fn().mockReturnThis()
    };
    const getUserById = vi.fn().mockResolvedValue({
      data: { user: { email: 'supervisor@example.com' } },
      error: null
    });
    const from = vi.fn().mockReturnValueOnce(accessQuery).mockReturnValueOnce(membersQuery);
    const service = new TenantAccessService(
      { authenticate: async () => ({ userId }) } as never,
      { create: () => ({ auth: { admin: { getUserById } }, from }) } as never
    );

    await expect(service.listTenantMembers('Bearer valid.jwt', tenantId)).resolves.toEqual({
      items: [
        {
          displayName: null,
          email: 'supervisor@example.com',
          role: 'supervisor',
          userId: '33333333-3333-4333-8333-333333333333'
        }
      ]
    });
    expect(from).toHaveBeenNthCalledWith(1, 'memberships');
    expect(from).toHaveBeenNthCalledWith(2, 'memberships');
    expect(getUserById).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333');
  });
});

describe('TenantAccessService own profile', () => {
  function createProfileService(admin: unknown): TenantAccessService {
    return new TenantAccessService(
      { authenticate: async () => ({ userId }) } as never,
      { create: () => ({ auth: { admin } }) } as never
    );
  }

  it('returns the signed-in name and email, reading only the caller account', async () => {
    const getUserById = vi.fn().mockResolvedValue({
      data: { user: { email: 'sara@example.com', user_metadata: { display_name: ' Sara ' } } },
      error: null
    });

    await expect(
      createProfileService({ getUserById }).getOwnProfile('Bearer valid.jwt')
    ).resolves.toEqual({
      item: { displayName: 'Sara', email: 'sara@example.com', userId }
    });
    expect(getUserById).toHaveBeenCalledWith(userId);
  });

  it('reports no name when the account has none, without inventing one', async () => {
    const getUserById = vi.fn().mockResolvedValue({
      data: { user: { email: 'sara@example.com' }, error: null },
      error: null
    });

    await expect(
      createProfileService({ getUserById }).getOwnProfile('Bearer valid.jwt')
    ).resolves.toEqual({
      item: { displayName: null, email: 'sara@example.com', userId }
    });
  });

  it('stores the name merging the existing metadata instead of replacing it', async () => {
    const getUserById = vi.fn().mockResolvedValue({
      data: { user: { user_metadata: { locale: 'es' } }, error: null },
      error: null
    });
    const updateUserById = vi.fn().mockResolvedValue({
      data: {
        user: {
          email: 'sara@example.com',
          user_metadata: { display_name: 'Sara', locale: 'es' }
        }
      },
      error: null
    });

    await expect(
      createProfileService({ getUserById, updateUserById }).updateOwnProfile('Bearer valid.jwt', {
        displayName: 'Sara'
      })
    ).resolves.toEqual({
      item: { displayName: 'Sara', email: 'sara@example.com', userId }
    });

    expect(updateUserById).toHaveBeenCalledWith(userId, {
      user_metadata: { display_name: 'Sara', locale: 'es' }
    });
  });

  it('fails visibly when the account cannot be read', async () => {
    const getUserById = vi
      .fn()
      .mockResolvedValue({ data: { user: null }, error: { message: 'x' } });

    await expect(
      createProfileService({ getUserById }).getOwnProfile('Bearer valid.jwt')
    ).rejects.toThrow('No fue posible cargar tu perfil.');
  });

  it('fails visibly when the name cannot be stored, without reporting success', async () => {
    const getUserById = vi.fn().mockResolvedValue({
      data: { user: { user_metadata: {} } },
      error: null
    });
    const updateUserById = vi
      .fn()
      .mockResolvedValue({ data: { user: null }, error: { message: 'boom' } });

    await expect(
      createProfileService({ getUserById, updateUserById }).updateOwnProfile('Bearer valid.jwt', {
        displayName: 'Sara'
      })
    ).rejects.toThrow('No fue posible guardar tu perfil.');
  });
});
