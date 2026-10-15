import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { ToolConversationService } from './tool-conversation.service';
import type { ToolTokenService } from './tool-token.service';

/**
 * Cerrar y pausar desde el bot.
 *
 * Tres cosas importan y son las que se prueban:
 *   1. Cerrar apaga el bot en la misma llamada. Cerrar sin apagar dejaria al bot respondiendo en un
 *      hilo cerrado; la unica forma de cerrar sin apagar es pedirlo explicitamente.
 *   2. Es idempotente: repetir el cierre devuelve el estado vigente y NO escribe otra vez. El bot no
 *      conoce la version, asi que un reintento de n8n no puede convertirse en un conflicto.
 *   3. Si la conversacion cambio entre la lectura y la escritura, la respuesta es un conflicto
 *      visible. No se pisa el cambio de otra persona en silencio.
 *
 * El doble responde por forma de consulta: la lectura termina en `maybeSingle` y la escritura
 * encadena `eq` y `maybeSingle` sobre la misma tabla.
 */

const CONVERSACION = {
  automation_mode: 'auto',
  automation_version: 3,
  id: 'conv-1',
  status: 'open',
  status_version: 5
};

function crearServicio(
  opciones: {
    actual?: Record<string, unknown> | null;
    actualizado?: Record<string, unknown> | null;
  } = {}
) {
  const actual = opciones.actual === undefined ? CONVERSACION : opciones.actual;
  const filas: Record<string, unknown>[] = [
    { data: actual, error: null },
    {
      data:
        opciones.actualizado === undefined
          ? { automation_mode: 'paused', id: 'conv-1', status: 'resolved' }
          : opciones.actualizado,
      error: null
    }
  ];
  let indice = 0;
  const update = vi.fn((filasDelParche: unknown) => {
    void filasDelParche;
    return cadena();
  });

  function cadena(): Record<string, unknown> {
    const encadenable: Record<string, unknown> = {
      eq: () => encadenable,
      maybeSingle: () => Promise.resolve(filas[Math.min(indice++, filas.length - 1)]),
      select: () => encadenable,
      update
    };
    return encadenable;
  }

  const supabase = { from: vi.fn(() => cadena()) };
  const servicio = new ToolConversationService(
    {
      assertScope: vi.fn(),
      authenticate: vi.fn().mockResolvedValue({
        scopes: ['conversations'],
        tenantId: 'tenant-1',
        tokenId: 'token-1'
      })
    } as unknown as ToolTokenService,
    { create: () => supabase } as unknown as SupabaseServerClientFactory
  );
  return { servicio, update };
}

describe('cerrar una conversacion desde el bot', () => {
  it('cierra y apaga el bot en la misma llamada', async () => {
    const { servicio, update } = crearServicio();

    const resultado = (await servicio.close('Bearer token', 'conv-1', {})) as {
      automationMode: string;
      status: string;
      tenantId: string;
    };

    const parche = update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(parche).toMatchObject({
      automation_mode: 'paused',
      automation_version: 4,
      status: 'resolved',
      status_version: 6
    });
    // La fecha de cierre la pone la regla del dominio, no este archivo.
    expect(typeof parche.resolved_at).toBe('string');
    expect(parche.closure_actor_type).toBe('bot');
    expect(parche.closure_actor_user_id).toBeNull();
    expect(resultado).toMatchObject({
      automationMode: 'paused',
      status: 'resolved',
      tenantId: 'tenant-1'
    });
  });

  it('con pauseBot en false cierra sin tocar el interruptor', async () => {
    const { servicio, update } = crearServicio();

    await servicio.close('Bearer token', 'conv-1', { pauseBot: false });

    const parche = update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect('automation_mode' in parche).toBe(false);
    expect(parche.status).toBe('resolved');
  });

  it('repetir el cierre no vuelve a escribir', async () => {
    const { servicio, update } = crearServicio({
      actual: { ...CONVERSACION, automation_mode: 'paused', status: 'resolved' }
    });

    const resultado = (await servicio.close('Bearer token', 'conv-1', {})) as { status: string };

    expect(resultado.status).toBe('resolved');
    expect(update).not.toHaveBeenCalled();
  });

  it('una conversacion de otro espacio da 404 y no escribe', async () => {
    const { servicio, update } = crearServicio({ actual: null });

    await expect(servicio.close('Bearer token', 'ajena', {})).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('si alguien movio la conversacion, la respuesta es un conflicto', async () => {
    const { servicio } = crearServicio({ actualizado: null });

    await expect(servicio.close('Bearer token', 'conv-1', {})).rejects.toBeInstanceOf(
      ConflictException
    );
  });
});

describe('encender o apagar el bot', () => {
  it('pausa sin cerrar la conversacion', async () => {
    const { servicio, update } = crearServicio();

    await servicio.setAutomation('Bearer token', 'conv-1', { mode: 'paused' });

    const parche = update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(parche).toMatchObject({ automation_mode: 'paused', automation_version: 4 });
    expect('status' in parche).toBe(false);
    expect('resolved_at' in parche).toBe(false);
  });

  it('rechaza un modo que no existe', async () => {
    const { servicio, update } = crearServicio();

    await expect(
      servicio.setAutomation('Bearer token', 'conv-1', { mode: 'apagado' })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(update).not.toHaveBeenCalled();
  });

  it('si ya esta en ese modo, no escribe', async () => {
    const { servicio, update } = crearServicio({
      actual: { ...CONVERSACION, automation_mode: 'paused' }
    });

    await servicio.setAutomation('Bearer token', 'conv-1', { mode: 'paused' });

    expect(update).not.toHaveBeenCalled();
  });
});
