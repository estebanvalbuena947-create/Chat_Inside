import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { RequestAuthenticator } from '../auth/request-authenticator';
import type { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import type { TenantAccessService } from './tenant-access.service';
import { AdvisorPresenceService } from './advisor-presence.service';
import { ADVISOR_PRESENCE_TTL_MS } from './advisor-presence.rule';

/**
 * Presencia de la bandeja.
 *
 * Es la unica puerta por la que alguien entra en la rotacion de transferencias. Tres cosas tienen
 * que quedar claras y son las que se prueban:
 *   1. Un pulso no puede declarar presencia en un espacio ajeno (se comprueba la membresia).
 *   2. Un identificador que no es un UUID responde 400, no un 500 de la base de datos.
 *   3. El pulso es idempotente: la misma persona puede repetirlo desde varias pestanas.
 */

const TENANT = 'b8b53c64-00c4-4739-a7ac-b8fc84ea0b72';

function crearServicio(opciones: { errorDeEscritura?: boolean; esMiembro?: boolean } = {}) {
  const upsert = vi
    .fn()
    .mockResolvedValue({ error: opciones.errorDeEscritura ? { message: 'x' } : null });
  const assertMembership = vi.fn().mockImplementation(async () => {
    if (opciones.esMiembro === false)
      throw new ForbiddenException('No tienes acceso a este tenant.');
  });

  const servicio = new AdvisorPresenceService(
    {
      authenticate: vi.fn().mockResolvedValue({ userId: 'user-1' })
    } as unknown as RequestAuthenticator,
    { assertMembership } as unknown as TenantAccessService,
    {
      create: () => ({ from: vi.fn(() => ({ upsert })) })
    } as unknown as SupabaseServerClientFactory
  );

  return { assertMembership, servicio, upsert };
}

describe('presencia de la bandeja', () => {
  it('registra la presencia de una persona del espacio y devuelve su ventana', async () => {
    const { assertMembership, servicio, upsert } = crearServicio();

    const respuesta = await servicio.heartbeat('Bearer token', TENANT);

    expect(assertMembership).toHaveBeenCalledWith('user-1', TENANT);
    expect(upsert).toHaveBeenCalledTimes(1);
    const filas = upsert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(filas).toMatchObject({ tenant_id: TENANT, user_id: 'user-1' });
    expect(typeof filas.last_seen_at).toBe('string');
    // La presencia vence en la ventana que declara la regla, y la respuesta lo dice.
    const vence = Date.parse(respuesta.activeUntil) - Date.now();
    expect(vence).toBeGreaterThan(ADVISOR_PRESENCE_TTL_MS - 5_000);
    expect(vence).toBeLessThan(ADVISOR_PRESENCE_TTL_MS + 5_000);
    expect(respuesta.tenantId).toBe(TENANT);
  });

  it('no deja declarar presencia en un espacio ajeno', async () => {
    const { servicio, upsert } = crearServicio({ esMiembro: false });

    await expect(servicio.heartbeat('Bearer token', TENANT)).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it('un espacio que no es un identificador valido responde 400 y no toca la base', async () => {
    const { assertMembership, servicio, upsert } = crearServicio();

    await expect(servicio.heartbeat('Bearer token', 'no-es-un-uuid')).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(assertMembership).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('si la base falla, el pulso lo dice en lugar de dar por hecha la presencia', async () => {
    const { servicio } = crearServicio({ errorDeEscritura: true });

    await expect(servicio.heartbeat('Bearer token', TENANT)).rejects.toBeInstanceOf(
      InternalServerErrorException
    );
  });

  it('repetir el pulso es idempotente: la clave es la persona y el espacio', async () => {
    const { servicio, upsert } = crearServicio();

    await servicio.heartbeat('Bearer token', TENANT);
    await servicio.heartbeat('Bearer token', TENANT);

    expect(upsert).toHaveBeenCalledTimes(2);
    for (const llamada of upsert.mock.calls) {
      expect(llamada[1]).toMatchObject({ onConflict: 'tenant_id,user_id' });
    }
  });
});
