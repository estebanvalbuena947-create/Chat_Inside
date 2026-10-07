import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { crearClienteSupabase } from '../tools/supabase-chain.fixture';
import type { RequestAuthenticator } from '../auth/request-authenticator';
import type { TenantAccessService } from '../tenants/tenant-access.service';
import { BranchService } from './branch.service';

/**
 * Las sedes del espacio, para la pantalla.
 *
 * Dos cosas pueden hacer dano si se rompen:
 *
 *   1. El aislamiento. Si la consulta dejara de acotarse al espacio, un usuario veria las sedes de
 *      otro negocio -- nombres y slugs de un tercero -- y podria importarles material.
 *   2. Que solo salgan las activas. Ofrecer una sucursal cerrada en el desplegable llevaria a
 *      alguien a cargarle fotos a una sede que ya no existe.
 *
 * La pertenencia se comprueba ANTES de consultar nada: sin ella no se llega a la base.
 */

const SEDE = { id: 'branch-1', name: 'Valle', slug: 'valle' };

function crearServicio(opciones: { miembro?: boolean; sedes?: unknown; error?: boolean } = {}) {
  const { argumentosDe, cliente, llamadasDe } = crearClienteSupabase({
    branches: opciones.error
      ? { data: null, error: { message: 'la base no responde' } }
      : { data: opciones.sedes ?? [SEDE], error: null }
  });

  const assertMembership = vi.fn(async () => {
    if (opciones.miembro === false) throw new ForbiddenException('Sin pertenencia.');
  });

  const servicio = new BranchService(
    {
      authenticate: vi.fn().mockResolvedValue({ userId: 'user-1' })
    } as unknown as RequestAuthenticator,
    { assertMembership } as unknown as TenantAccessService,
    { create: () => cliente } as unknown as SupabaseServerClientFactory
  );

  return { argumentosDe, assertMembership, llamadasDe, servicio };
}

describe('sedes del espacio', () => {
  it('devuelve las sedes con lo justo para elegir una', async () => {
    const { servicio } = crearServicio();

    const resultado = (await servicio.list('Bearer token', 'tenant-1')) as {
      branches: Array<{ id: string; name: string; slug: string }>;
      tenantId: string;
    };

    expect(resultado.tenantId).toBe('tenant-1');
    expect(resultado.branches).toEqual([{ id: 'branch-1', name: 'Valle', slug: 'valle' }]);
  });

  it('la consulta se acota al espacio y a las sedes activas', async () => {
    const { llamadasDe, servicio } = crearServicio();

    await servicio.list('Bearer token', 'tenant-1');

    const condiciones = llamadasDe('branches')
      .filter((llamada) => llamada.metodo === 'eq')
      .map((llamada) => llamada.args);
    expect(condiciones).toContainEqual(['tenant_id', 'tenant-1']);
    expect(condiciones).toContainEqual(['is_active', true]);
  });

  it('sin pertenencia al espacio no se consulta nada', async () => {
    const { llamadasDe, servicio } = crearServicio({ miembro: false });

    await expect(servicio.list('Bearer token', 'tenant-1')).rejects.toBeInstanceOf(
      ForbiddenException
    );

    expect(llamadasDe('branches')).toHaveLength(0);
  });

  it('una consulta con error no devuelve una lista vacia como si no hubiera sedes', async () => {
    const { servicio } = crearServicio({ error: true });

    // Un fallo de la base no es lo mismo que un espacio sin sedes: confundirlos haria que la
    // pantalla dijera "no hay sedes" cuando en realidad no se pudo preguntar.
    await expect(servicio.list('Bearer token', 'tenant-1')).rejects.toThrow();
  });

  it('un espacio sin sedes devuelve una lista vacia, no nula', async () => {
    const { servicio } = crearServicio({ sedes: [] });

    const resultado = (await servicio.list('Bearer token', 'tenant-1')) as { branches: unknown[] };

    expect(resultado.branches).toEqual([]);
  });

  it('busca por el orden legible del slug', async () => {
    const { llamadasDe, servicio } = crearServicio();

    await servicio.list('Bearer token', 'tenant-1');

    expect(llamadasDe('branches').some((llamada) => llamada.metodo === 'order')).toBe(true);
  });
});
