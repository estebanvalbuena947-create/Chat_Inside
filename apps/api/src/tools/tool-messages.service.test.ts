import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { TenantMessageService } from '../conversations/tenant-message.service';
import type { ToolMessagesService } from './tool-messages.service';
import { ToolMessagesService as Servicio } from './tool-messages.service';
import type { ToolTokenService } from './tool-token.service';

/**
 * Envio de mensajes del bot.
 *
 * La prueba que importa es la del interruptor apagado: no basta con que devuelva un error, hay que
 * comprobar que el mensaje NO se encola. Un error que llega despues de haber encolado seria peor que
 * no tener interruptor, porque el cliente recibiria el mensaje igual.
 */

const UUID = '6b1f4c2e-9d3a-4f58-8b7c-1e2d3f4a5b6c';

function crearServicio(opciones: { habilitado: boolean | null; errorIntegracion?: boolean }) {
  const enqueueOutbound = vi.fn().mockResolvedValue({ item: { id: 'msg-1' } });
  const integracion =
    opciones.habilitado === null ? null : { sending_enabled: opciones.habilitado };

  const supabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: integracion,
            error: opciones.errorIntegracion ? { message: 'fallo' } : null
          })
        }))
      }))
    }))
  };

  const toolTokenService = {
    assertScope: vi.fn(),
    authenticate: vi.fn().mockResolvedValue({
      scopes: ['messages'],
      tenantId: 'tenant-1',
      tokenId: 'token-1'
    })
  };

  const servicio = new Servicio(
    toolTokenService as unknown as ToolTokenService,
    { enqueueOutbound } as unknown as TenantMessageService,
    { create: () => supabase } as never
  );

  return { enqueueOutbound, servicio, toolTokenService };
}

const cuerpoValido = {
  body: 'Hola, ¿te confirmo la cita?',
  conversationId: 'conv-1',
  idempotencyKey: UUID
};

describe('envio de mensajes del bot', () => {
  it('con el interruptor apagado rechaza el envio Y NO encola nada', async () => {
    const { enqueueOutbound, servicio } = crearServicio({ habilitado: false });

    await expect(servicio.send('Bearer token', cuerpoValido)).rejects.toBeInstanceOf(
      UnprocessableEntityException
    );
    expect(enqueueOutbound).not.toHaveBeenCalled();
  });

  it('sin configuracion del bot tambien rechaza y no encola', async () => {
    const { enqueueOutbound, servicio } = crearServicio({ habilitado: null });

    await expect(servicio.send('Bearer token', cuerpoValido)).rejects.toBeInstanceOf(
      UnprocessableEntityException
    );
    expect(enqueueOutbound).not.toHaveBeenCalled();
  });

  it('si no se puede comprobar el estado, rechaza en lugar de enviar por su cuenta', async () => {
    const { enqueueOutbound, servicio } = crearServicio({
      habilitado: true,
      errorIntegracion: true
    });

    await expect(servicio.send('Bearer token', cuerpoValido)).rejects.toBeInstanceOf(
      UnprocessableEntityException
    );
    expect(enqueueOutbound).not.toHaveBeenCalled();
  });

  it('con el interruptor encendido encola como automatizacion, en el espacio del token', async () => {
    const { enqueueOutbound, servicio } = crearServicio({ habilitado: true });

    const resultado = await servicio.send('Bearer token', cuerpoValido);

    expect(enqueueOutbound).toHaveBeenCalledTimes(1);
    expect(enqueueOutbound).toHaveBeenCalledWith({
      command: { body: cuerpoValido.body, idempotencyKey: UUID },
      conversationId: 'conv-1',
      senderType: 'automation',
      senderUserId: null,
      tenantId: 'tenant-1'
    });
    expect(resultado).toMatchObject({ tenantId: 'tenant-1' });
  });

  it('exige el permiso de mensajes antes de nada', async () => {
    const { servicio, toolTokenService } = crearServicio({ habilitado: true });

    await servicio.send('Bearer token', cuerpoValido);

    expect(toolTokenService.assertScope).toHaveBeenCalledWith(
      { scopes: ['messages'], tenantId: 'tenant-1', tokenId: 'token-1' },
      'messages'
    );
  });

  it('rechaza un mensaje sin texto o sin clave de idempotencia valida', async () => {
    const { enqueueOutbound, servicio } = crearServicio({ habilitado: true });

    await expect(
      servicio.send('Bearer token', { ...cuerpoValido, idempotencyKey: 'no-es-un-uuid' })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    await expect(
      servicio.send('Bearer token', { ...cuerpoValido, body: '   ' })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    await expect(
      servicio.send('Bearer token', { ...cuerpoValido, conversationId: undefined })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(enqueueOutbound).not.toHaveBeenCalled();
  });
});

/** Referencia de tipo para que el import no quede sin usar si el archivo cambia. */
export type ServicioDeMensajes = ToolMessagesService;
