import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { ToolConversationService } from './tool-conversation.service';
import type { ToolTokenService } from './tool-token.service';

/**
 * Fijar la sede de una conversacion.
 *
 * Tres cosas se sostienen aqui, y las tres pueden hacer dano si se rompen:
 *   1. Una sede que no existe --o que esta INACTIVA-- no se fija. Sin esa comprobacion el bot
 *      podria ofrecer una sede cerrada.
 *   2. Se guarda el IDENTIFICADOR, no el nombre. Si el negocio renombra una sede, la conversacion
 *      tiene que seguir apuntando a la misma.
 *   3. La sede se busca dentro del espacio del token: un slug de otro negocio no existe.
 *
 * El doble usa una cola de respuestas porque el servicio consulta la sede y luego actualiza la
 * conversacion. Con un unico resultado, la prueba del orden pasaria sin comprobar el orden.
 */

const SEDE = { id: 'branch-1', name: 'Polanco', slug: 'polanco' };

function crearServicio(opciones: { existeSede?: boolean; existeConversacion?: boolean } = {}) {
  const update = vi.fn();
  let paso = 0;

  const respuestas: unknown[] = [
    { data: opciones.existeSede === false ? null : SEDE, error: null },
    {
      data: opciones.existeConversacion === false ? null : { branch_id: 'branch-1', id: 'conv-1' },
      error: null
    }
  ];
  const siguiente = () => Promise.resolve(respuestas[Math.min(paso++, respuestas.length - 1)]);

  const cadena = (): Record<string, unknown> => {
    const encadenable: Record<string, unknown> = {
      eq: () => encadenable,
      maybeSingle: () => siguiente(),
      select: () => encadenable,
      then: (resolver: (valor: unknown) => unknown) => siguiente().then(resolver),
      update: (...args: unknown[]) => {
        update(...args);
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

  const servicio = new ToolConversationService(
    toolTokenService as unknown as ToolTokenService,
    { create: () => supabase } as unknown as SupabaseServerClientFactory
  );

  return { servicio, toolTokenService, update };
}

describe('fijar la sede de la conversacion', () => {
  it('fija la sede por su identificador, no por su nombre', async () => {
    const { servicio, update } = crearServicio();

    const resultado = (await servicio.setBranch('Bearer token', 'conv-1', {
      branchSlug: 'polanco'
    })) as { branch: { name: string; slug: string }; conversationId: string; tenantId: string };

    expect(update).toHaveBeenCalledTimes(1);
    const filas = update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(filas).toMatchObject({ branch_id: 'branch-1' });
    expect(resultado).toMatchObject({ conversationId: 'conv-1', tenantId: 'tenant-1' });
    expect(resultado.branch).toMatchObject({ name: 'Polanco', slug: 'polanco' });
  });

  it('una sede que no existe o esta inactiva da 404 y NO toca la conversacion', async () => {
    const { servicio, update } = crearServicio({ existeSede: false });

    await expect(
      servicio.setBranch('Bearer token', 'conv-1', { branchSlug: 'cerrada' })
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(update).not.toHaveBeenCalled();
  });

  it('una conversacion de otro espacio da 404', async () => {
    const { servicio } = crearServicio({ existeConversacion: false });

    await expect(
      servicio.setBranch('Bearer token', 'ajena', { branchSlug: 'polanco' })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rechaza la llamada sin sede o sin conversacion', async () => {
    const { servicio, update } = crearServicio();

    await expect(
      servicio.setBranch('Bearer token', 'conv-1', { branchSlug: '   ' })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      servicio.setBranch('Bearer token', '', { branchSlug: 'polanco' })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(update).not.toHaveBeenCalled();
  });

  it('exige el permiso de conversaciones antes de tocar nada', async () => {
    const { servicio, toolTokenService } = crearServicio();

    await servicio.setBranch('Bearer token', 'conv-1', { branchSlug: 'polanco' });

    expect(toolTokenService.assertScope).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      'conversations'
    );
  });
});
