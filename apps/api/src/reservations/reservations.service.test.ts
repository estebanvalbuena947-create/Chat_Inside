import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const from = vi.fn();
vi.mock('@chat-zernio/config', () => ({
  createReservationsSupabaseClient: vi.fn(() => ({ rpc, from }))
}));

import { ReservationsService } from './reservations.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const key = '22222222-2222-4222-8222-222222222222';

function service(roleError?: Error) {
  return new ReservationsService(
    { authenticate: vi.fn().mockResolvedValue({ userId: 'user-1' }) } as never,
    {
      assertRole: vi
        .fn()
        .mockImplementation(() => (roleError ? Promise.reject(roleError) : Promise.resolve())),
      getOwnProfile: vi.fn().mockResolvedValue({ item: { email: 'admin@example.com' } })
    } as never
  );
}

describe('ReservationsService.decide', () => {
  beforeEach(() => rpc.mockReset());

  it('authorizes the Inbox actor and delegates one atomic, idempotent command to SPA', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        action: 'approved',
        decided_by_email: 'admin@example.com',
        duplicate: false,
        previous_status: 'revision',
        resulting_status: 'confirmado'
      },
      error: null
    });
    await expect(
      service().decide('Bearer token', tenantId, 7, {
        action: 'approved',
        idempotencyKey: key,
        note: 'Pago validado'
      })
    ).resolves.toMatchObject({ item: { reservationDraftId: 7, duplicate: false } });
    expect(rpc).toHaveBeenCalledWith(
      'process_chat_reservation_decision',
      expect.objectContaining({
        p_actor_email: 'admin@example.com',
        p_idempotency_key: key,
        p_reservation_draft_id: 7
      })
    );
  });

  it('does not call SPA when the Inbox role is not allowed', async () => {
    await expect(
      service(new ForbiddenException()).decide('Bearer token', tenantId, 7, {
        action: 'rejected',
        idempotencyKey: key,
        note: null
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not report success when the external atomic command fails', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await expect(
      service().decide('Bearer token', tenantId, 7, {
        action: 'needs_info',
        idempotencyKey: key,
        note: null
      })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe('ReservationsService.board: gestión y creación', () => {
  const now = new Date('2026-10-20T18:00:00Z');
  const drafts = [
    {
      id: 1,
      created_at: '2026-10-20T06:00:00Z',
      estado_reserva: 'pendiente_pago',
      monto_pagado: 100
    },
    {
      id: 2,
      created_at: '2026-10-19T18:00:00Z',
      comprobante_revision_at: '2026-10-20T12:00:00Z',
      estado_reserva: 'requiere_revision_pago'
    },
    { id: 3, created_at: '2026-10-20T10:00:00Z', estado_reserva: 'cancelando_expirada' },
    { id: 4, comprobante_revision_at: '2026-10-20T12:00:00Z', estado_reserva: 'pendiente_pago' },
    {
      id: 5,
      created_at: '2026-10-20T10:00:00Z',
      estado_reserva: 'requiere_revision_pago',
      monto_pagado: 200
    }
  ];
  beforeEach(() => {
    from.mockReset();
    from.mockImplementation((table: string) => {
      const query = {
        select: vi.fn(() => query),
        order: vi.fn(() => query),
        range: vi
          .fn()
          .mockResolvedValue({ data: table === 'reservas_draft' ? drafts : [], error: null })
      };
      return query;
    });
  });
  it('devuelve misma lista y conteo para hoy, sin sustituir creación por revisión', async () => {
    const result = await service().board('Bearer token', tenantId, now);
    expect(result.porGestionar.map((row) => row.id)).toEqual([1, 5]);
    expect(result.kpis.porGestionar).toBe(result.porGestionar.length);
    expect(result.kpis.montoPendiente).toBe(300);
    expect(result.draftScope).toBe('day');
    expect(result.sinFechaCreacion).toBe(1);
    expect(result.creadasHoy.map((row) => row.id)).toEqual([1, 3, 5]);
    expect(result.dailyDrafts).toEqual([{ date: '2026-10-20', total: 3 }]);
    expect(result.preReservas.find((row) => row.id === 3)?.estadoEtiqueta).toBe(
      'Cancelación por vencimiento'
    );
    expect(result.preReservas.find((row) => row.id === 4)?.creadaEn).toBeNull();
  });
  it('fecha elegida y todos los días mantienen alcances explícitos', async () => {
    const selected = await service().board('Bearer token', tenantId, now, '2026-10-19');
    expect(selected.porGestionar.map((row) => row.id)).toEqual([2]);
    const all = await service().board('Bearer token', tenantId, now, '2026-10-19', 'all');
    expect(all.porGestionar.map((row) => row.id)).toEqual([1, 4, 2, 5]);
    expect(all.kpis.porGestionar).toBe(4);
    expect(all.draftScope).toBe('all');
  });
  it('autoriza antes de consultar los datos externos', async () => {
    await expect(
      service(new ForbiddenException()).board('Bearer token', tenantId, now)
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(from).not.toHaveBeenCalled();
  });
});
