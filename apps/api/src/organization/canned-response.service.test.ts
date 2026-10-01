import { ConflictException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CannedResponseService } from './canned-response.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const otherUserId = '55555555-5555-4555-8555-555555555555';
const responseId = '33333333-3333-4333-8333-333333333333';
const idempotencyKey = '44444444-4444-4444-8444-444444444444';

const persistedResponse = {
  body: 'Hola, ¿cómo podemos ayudarte?',
  created_by_user_id: userId,
  id: responseId,
  idempotency_key: idempotencyKey,
  title: 'Saludo',
  updated_at: '2026-08-14T22:00:00.000Z',
  version: 1
};

function createService(
  results: Array<{ data: unknown; error: unknown }>,
  options: { role?: string } = {}
) {
  const maybeSingle = vi.fn();
  for (const result of results) maybeSingle.mockResolvedValueOnce(result);
  const builder = {
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    maybeSingle,
    order: vi.fn(() => builder),
    select: vi.fn(() => builder),
    update: vi.fn(() => builder)
  };
  const from = vi.fn(() => builder);
  const assertMembership = vi.fn().mockResolvedValue(undefined);
  const resolveRole = vi.fn().mockResolvedValue(options.role ?? 'agent');
  const service = new CannedResponseService(
    { authenticate: vi.fn().mockResolvedValue({ userId }) } as never,
    { assertMembership, resolveRole } as never,
    { create: () => ({ from }) } as never
  );
  return { assertMembership, builder, from, resolveRole, service };
}

describe('CannedResponseService', () => {
  it('lets any member create a response and marks it as their own', async () => {
    const { assertMembership, from, service } = createService([
      { data: null, error: null },
      { data: persistedResponse, error: null }
    ]);

    await expect(
      service.create('Bearer valid.jwt', tenantId, {
        body: persistedResponse.body,
        idempotencyKey,
        title: persistedResponse.title
      })
    ).resolves.toMatchObject({ item: { canManage: true, id: responseId, version: 1 } });

    expect(assertMembership).toHaveBeenCalledWith(userId, tenantId);
    expect(from).toHaveBeenCalledTimes(2);
    expect(from).toHaveBeenCalledWith('canned_responses');
  });

  it('reuses the existing response when a creation command is repeated', async () => {
    const { from, service } = createService([{ data: persistedResponse, error: null }]);

    await expect(
      service.create('Bearer valid.jwt', tenantId, {
        body: persistedResponse.body,
        idempotencyKey,
        title: persistedResponse.title
      })
    ).resolves.toMatchObject({ item: { canManage: true, id: responseId, title: 'Saludo' } });

    expect(from).toHaveBeenCalledTimes(1);
  });

  it('lets the author edit their own response', async () => {
    const { builder, service } = createService([
      { data: persistedResponse, error: null },
      { data: { ...persistedResponse, body: 'Texto propio', version: 2 }, error: null }
    ]);

    await expect(
      service.update('Bearer valid.jwt', tenantId, responseId, {
        body: 'Texto propio',
        title: 'Saludo',
        version: 1
      })
    ).resolves.toMatchObject({ item: { canManage: true, version: 2 } });

    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Texto propio', version: 2 })
    );
  });

  it('stops an agent from rewriting a response created by someone else', async () => {
    const { builder, service } = createService([
      { data: { ...persistedResponse, created_by_user_id: otherUserId }, error: null }
    ]);

    await expect(
      service.update('Bearer valid.jwt', tenantId, responseId, {
        body: 'Cambio ajeno',
        title: 'Saludo',
        version: 1
      })
    ).rejects.toThrow(ForbiddenException);

    expect(builder.update).not.toHaveBeenCalled();
  });

  it('lets a supervisor manage any response of the tenant', async () => {
    const { builder, service } = createService(
      [
        { data: { ...persistedResponse, created_by_user_id: otherUserId }, error: null },
        { data: { ...persistedResponse, body: 'Curado', version: 2 }, error: null }
      ],
      { role: 'supervisor' }
    );

    await expect(
      service.update('Bearer valid.jwt', tenantId, responseId, {
        body: 'Curado',
        title: 'Saludo',
        version: 1
      })
    ).resolves.toMatchObject({ item: { canManage: true, version: 2 } });

    expect(builder.update).toHaveBeenCalled();
  });

  it('rejects a stale edit instead of overwriting a newer response', async () => {
    const { service } = createService([
      { data: persistedResponse, error: null },
      { data: null, error: null },
      { data: { ...persistedResponse, body: 'Texto actualizado', version: 2 }, error: null }
    ]);

    await expect(
      service.update('Bearer valid.jwt', tenantId, responseId, {
        body: 'Otro texto',
        title: 'Saludo',
        version: 1
      })
    ).rejects.toThrow(ConflictException);
  });

  it('refuses to delete a response created by another person when the caller is an agent', async () => {
    const { builder, service } = createService([
      { data: { ...persistedResponse, created_by_user_id: otherUserId }, error: null }
    ]);

    await expect(
      service.remove('Bearer valid.jwt', tenantId, responseId, { version: 1 })
    ).rejects.toThrow(ForbiddenException);

    expect(builder.delete).not.toHaveBeenCalled();
  });

  it('flags each listed response with what the caller can manage', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: [
        { ...persistedResponse, created_by_user_id: userId },
        { ...persistedResponse, created_by_user_id: otherUserId, id: otherUserId }
      ],
      error: null
    });
    const builder = {
      eq: vi.fn(() => builder),
      maybeSingle,
      order: vi.fn().mockResolvedValue({
        data: [
          { ...persistedResponse, created_by_user_id: userId },
          { ...persistedResponse, created_by_user_id: otherUserId, id: otherUserId }
        ],
        error: null
      }),
      select: vi.fn(() => builder)
    };
    const service = new CannedResponseService(
      { authenticate: vi.fn().mockResolvedValue({ userId }) } as never,
      {
        assertMembership: vi.fn(),
        resolveRole: vi.fn().mockResolvedValue('agent')
      } as never,
      { create: () => ({ from: () => builder }) } as never
    );

    const listed = await service.list('Bearer valid.jwt', tenantId);
    expect(listed.items.map((item) => item.canManage)).toEqual([true, false]);
  });

  it('requires membership before listing the library', async () => {
    const { assertMembership, service } = createService([]);
    await service.list('Bearer valid.jwt', tenantId);
    expect(assertMembership).toHaveBeenCalledWith(userId, tenantId);
  });
});
