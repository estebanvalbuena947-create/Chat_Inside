import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { ToolAssignmentsService } from './tool-assignments.service';
import type { ToolTokenService } from './tool-token.service';

/**
 * Etiquetas de conversacion: el "no insistir" del bot.
 *
 * Lo que estas pruebas sujetan:
 *   1. Aplicar dos veces la misma etiqueta NO duplica nada. Un flujo que reintente no puede
 *      ensuciar la conversacion.
 *   2. Una etiqueta que no existe se crea, como pide el contrato: el bot no tiene que saber de
 *      antemano como se llaman.
 *   3. La conversacion se busca dentro del espacio del token: no se etiqueta la de otro negocio.
 *
 * El doble devuelve la propia cadena en cada paso y usa una cola de respuestas, porque el servicio
 * consulta y escribe en un orden concreto (conversacion, etiquetas existentes, alta, relectura,
 * aplicacion). Con un unico resultado, la prueba del orden pasaria sin comprobar el orden.
 */

function crearServicio(
  opciones: { existeConversacion?: boolean; etiquetasExistentes?: unknown[] } = {}
) {
  const upsert = vi.fn();
  const insert = vi.fn();
  let paso = 0;

  const respuestas: unknown[] = [
    { data: opciones.existeConversacion === false ? null : { id: 'conv-1' }, error: null },
    { data: opciones.etiquetasExistentes ?? [{ id: 'l1', name: 'Nuevo Cliente' }], error: null },
    { data: null, error: null },
    {
      data: [
        { id: 'l1', name: 'Nuevo Cliente' },
        { id: 'l2', name: 'no_insistir' }
      ],
      error: null
    },
    { data: null, error: null }
  ];
  const siguiente = () => Promise.resolve(respuestas[Math.min(paso++, respuestas.length - 1)]);

  const cadena = (): Record<string, unknown> => {
    const encadenable: Record<string, unknown> = {
      eq: () => encadenable,
      in: () => encadenable,
      insert: (...args: unknown[]) => {
        insert(...args);
        return encadenable;
      },
      maybeSingle: () => siguiente(),
      select: () => encadenable,
      then: (resolver: (valor: unknown) => unknown) => siguiente().then(resolver),
      upsert: (...args: unknown[]) => {
        upsert(...args);
        return encadenable;
      }
    };
    return encadenable;
  };

  const supabase = { from: vi.fn(() => cadena()) };

  const toolTokenService = {
    assertScope: vi.fn(),
    authenticate: vi.fn().mockResolvedValue({
      scopes: ['conversations'],
      tenantId: 'tenant-1',
      tokenId: 'token-1'
    })
  };

  const servicio = new ToolAssignmentsService(
    toolTokenService as unknown as ToolTokenService,
    { create: () => supabase } as unknown as SupabaseServerClientFactory
  );

  return { insert, servicio, toolTokenService, upsert };
}

describe('etiquetas de conversacion', () => {
  it('aplica las etiquetas y devuelve sus nombres', async () => {
    const { servicio, upsert } = crearServicio();

    const resultado = (await servicio.applyLabels('Bearer token', 'conv-1', {
      labels: ['Nuevo Cliente', 'no_insistir']
    })) as { conversationId: string; labels: string[]; tenantId: string };

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(resultado).toMatchObject({ conversationId: 'conv-1', tenantId: 'tenant-1' });
    expect(resultado.labels).toEqual(['Nuevo Cliente', 'no_insistir']);
  });

  it('es idempotente: aplica con ignoreDuplicates y clave de conflicto', async () => {
    const { servicio, upsert } = crearServicio();

    await servicio.applyLabels('Bearer token', 'conv-1', { labels: ['no_insistir'] });

    const opciones = upsert.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(opciones).toMatchObject({
      ignoreDuplicates: true,
      onConflict: 'conversation_id,label_id'
    });
  });

  it('crea la etiqueta que no existe todavia', async () => {
    const { insert, servicio } = crearServicio();

    await servicio.applyLabels('Bearer token', 'conv-1', {
      labels: ['Nuevo Cliente', 'no_insistir']
    });

    expect(insert).toHaveBeenCalledTimes(1);
    const filas = insert.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(filas).toEqual([{ name: 'no_insistir', tenant_id: 'tenant-1' }]);
  });

  it('si todas existen, no crea ninguna', async () => {
    const { insert, servicio } = crearServicio({
      etiquetasExistentes: [{ id: 'l2', name: 'no_insistir' }]
    });

    await servicio.applyLabels('Bearer token', 'conv-1', { labels: ['no_insistir'] });

    expect(insert).not.toHaveBeenCalled();
  });

  it('una conversacion de otro espacio da 404 y no aplica nada', async () => {
    const { servicio, upsert } = crearServicio({ existeConversacion: false });

    await expect(
      servicio.applyLabels('Bearer token', 'ajena', { labels: ['no_insistir'] })
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(upsert).not.toHaveBeenCalled();
  });

  it('rechaza una lista vacia, sin conversacion o sin nombres validos', async () => {
    const { servicio, upsert } = crearServicio();

    await expect(
      servicio.applyLabels('Bearer token', 'conv-1', { labels: [] })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      servicio.applyLabels('Bearer token', '', { labels: ['x'] })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      servicio.applyLabels('Bearer token', 'conv-1', { labels: ['   ', 42] })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(upsert).not.toHaveBeenCalled();
  });

  it('exige el permiso de conversaciones antes de tocar nada', async () => {
    const { servicio, toolTokenService } = crearServicio();

    await servicio.applyLabels('Bearer token', 'conv-1', { labels: ['no_insistir'] });

    expect(toolTokenService.assertScope).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      'conversations'
    );
  });
});
