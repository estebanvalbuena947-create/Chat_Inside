import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { InternalLabelService } from './internal-label.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const conversationId = '33333333-3333-4333-8333-333333333333';
const labelId = '44444444-4444-4444-8444-444444444444';
const idempotencyKey = '55555555-5555-4555-8555-555555555555';

const persistedLabel = {
  color: '#f6d5d5',
  id: labelId,
  idempotency_key: idempotencyKey,
  name: 'Prioridad alta',
  updated_at: '2026-08-14T22:00:00.000Z',
  version: 1
};

function singleQuery(result: { data: unknown; error: unknown }) {
  const query = {
    delete: vi.fn(() => query),
    eq: vi.fn(() => query),
    insert: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue(result),
    select: vi.fn(() => query),
    update: vi.fn(() => query)
  };
  return query;
}

function listQuery(result: { data: unknown; error: unknown }) {
  const query = {
    eq: vi.fn(() => query),
    order: vi.fn().mockResolvedValue(result),
    select: vi.fn(() => query)
  };
  return query;
}

function createService(from: ReturnType<typeof vi.fn>) {
  const assertMembership = vi.fn().mockResolvedValue(undefined);
  const assertRole = vi.fn().mockResolvedValue(undefined);
  const service = new InternalLabelService(
    { authenticate: vi.fn().mockResolvedValue({ userId }) } as never,
    { assertMembership, assertRole } as never,
    { create: () => ({ from }) } as never
  );
  return { assertMembership, assertRole, service };
}

describe('InternalLabelService', () => {
  it('creates a tenant-scoped label only after requiring the administrator role', async () => {
    const colors = singleQuery({ data: [], error: null });
    const existing = singleQuery({ data: null, error: null });
    const inserted = singleQuery({ data: persistedLabel, error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce(existing)
      .mockReturnValueOnce(colors)
      .mockReturnValueOnce(inserted);
    const { assertRole, service } = createService(from);

    await expect(
      service.create('Bearer valid.jwt', tenantId, {
        idempotencyKey,
        name: persistedLabel.name
      })
    ).resolves.toMatchObject({ item: { id: labelId, version: 1 } });

    expect(assertRole).toHaveBeenCalledWith(userId, tenantId, ['admin', 'supervisor']);
    expect(inserted.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        color: expect.stringMatching(/^#[0-9a-f]{6}$/),
        name: persistedLabel.name,
        tenant_id: tenantId
      })
    );
  });

  it('reuses an existing label when the same creation command is repeated', async () => {
    const from = vi.fn().mockReturnValue(singleQuery({ data: persistedLabel, error: null }));
    const { service } = createService(from);

    await expect(
      service.create('Bearer valid.jwt', tenantId, {
        idempotencyKey,
        name: persistedLabel.name
      })
    ).resolves.toMatchObject({ item: { id: labelId, name: persistedLabel.name } });

    expect(from).toHaveBeenCalledTimes(1);
  });

  it('rejects a stale edit instead of overwriting a newer label', async () => {
    const missingUpdate = singleQuery({ data: null, error: null });
    const current = singleQuery({
      data: { ...persistedLabel, name: 'Nuevo nombre', version: 2 },
      error: null
    });
    const from = vi.fn().mockReturnValueOnce(missingUpdate).mockReturnValueOnce(current);
    const { service } = createService(from);

    await expect(
      service.update('Bearer valid.jwt', tenantId, labelId, {
        name: 'Otro nombre',
        version: 1
      })
    ).rejects.toThrow(ConflictException);
  });

  it('applies a label idempotently after verifying membership and both tenant-scoped resources', async () => {
    const conversation = singleQuery({ data: { id: conversationId }, error: null });
    const label = singleQuery({ data: persistedLabel, error: null });
    const link = { upsert: vi.fn().mockResolvedValue({ error: null }) };
    const linkedLabels = listQuery({ data: [{ label: persistedLabel }], error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce(conversation)
      .mockReturnValueOnce(label)
      .mockReturnValueOnce(link)
      .mockReturnValueOnce(linkedLabels);
    const { assertMembership, service } = createService(from);

    await expect(
      service.assign('Bearer valid.jwt', tenantId, conversationId, labelId)
    ).resolves.toEqual({
      items: [
        {
          color: persistedLabel.color,
          id: labelId,
          name: persistedLabel.name,
          updatedAt: persistedLabel.updated_at,
          version: 1
        }
      ]
    });

    expect(assertMembership).toHaveBeenCalledWith(userId, tenantId);
    expect(link.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: conversationId,
        label_id: labelId,
        tenant_id: tenantId
      }),
      { ignoreDuplicates: true, onConflict: 'tenant_id,conversation_id,label_id' }
    );
  });

  it('does not link a label that is absent or belongs to another tenant', async () => {
    const conversation = singleQuery({ data: { id: conversationId }, error: null });
    const absentLabel = singleQuery({ data: null, error: null });
    const from = vi.fn().mockReturnValueOnce(conversation).mockReturnValueOnce(absentLabel);
    const { service } = createService(from);

    await expect(
      service.assign('Bearer valid.jwt', tenantId, conversationId, labelId)
    ).rejects.toThrow(NotFoundException);
    expect(from).toHaveBeenCalledTimes(2);
  });
});
