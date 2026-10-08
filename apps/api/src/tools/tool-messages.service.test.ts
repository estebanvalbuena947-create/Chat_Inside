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

function crearServicio(opciones: {
  habilitado: boolean | null;
  errorIntegracion?: boolean;
  canal?: string | null;
  ultimoEntrante?: string | null;
}) {
  const enqueueOutbound = vi.fn().mockResolvedValue({ item: { id: 'msg-1' } });
  const integracion =
    opciones.habilitado === null ? null : { sending_enabled: opciones.habilitado };

  const supabase = {
    from: vi.fn((tabla: string) => {
      const builder: Record<string, unknown> = {};
      for (const metodo of ['eq', 'order', 'limit', 'select']) builder[metodo] = () => builder;

      if (tabla === 'conversations') {
        builder.maybeSingle = vi.fn().mockResolvedValue({
          data:
            opciones.canal === undefined
              ? null
              : { channel_account: { platform: opciones.canal }, id: 'conv-1' },
          error: null
        });
        return builder;
      }
      if (tabla === 'messages') {
        builder.maybeSingle = vi.fn().mockResolvedValue({
          data: opciones.ultimoEntrante ? { created_at: opciones.ultimoEntrante } : null,
          error: null
        });
        return builder;
      }

      builder.maybeSingle = vi.fn().mockResolvedValue({
        data: integracion,
        error: opciones.errorIntegracion ? { message: 'fallo' } : null
      });
      return builder;
    })
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
  body: 'Hola, Â¿te confirmo la cita?',
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
      command: { body: cuerpoValido.body, idempotencyKey: UUID, kind: 'text' },
      conversationId: 'conv-1',
      senderType: 'automation',
      senderUserId: null,
      tenantId: 'tenant-1'
    });
    expect(resultado).toMatchObject({ tenantId: 'tenant-1' });
  });

  it('envia una plantilla aprobada y la encola como tal, no como texto', async () => {
    const { enqueueOutbound, servicio } = crearServicio({ habilitado: true });

    const resultado = await servicio.send('Bearer token', {
      conversationId: 'conv-1',
      idempotencyKey: UUID,
      whatsappTemplate: { language: 'es_MX', name: 'notificacion_48h' }
    });

    expect(enqueueOutbound).toHaveBeenCalledTimes(1);
    expect(enqueueOutbound).toHaveBeenCalledWith({
      command: {
        idempotencyKey: UUID,
        kind: 'whatsapp_template',
        whatsappTemplate: { language: 'es_MX', name: 'notificacion_48h' }
      },
      conversationId: 'conv-1',
      senderType: 'automation',
      senderUserId: null,
      tenantId: 'tenant-1'
    });
    expect(resultado).toMatchObject({ tenantId: 'tenant-1' });
  });

  it('una plantilla aprobada no admite texto, multimedia ni plantilla interna', async () => {
    for (const extra of [
      { body: 'Hola' },
      { media: [{ id: 'media-1' }] },
      { templateName: 'confirmacion_ig_is' }
    ]) {
      const { enqueueOutbound, servicio } = crearServicio({ habilitado: true });
      await expect(
        servicio.send('Bearer token', {
          conversationId: 'conv-1',
          idempotencyKey: UUID,
          whatsappTemplate: { language: 'es_MX', name: 'notificacion_48h' },
          ...extra
        })
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(enqueueOutbound, JSON.stringify(extra)).not.toHaveBeenCalled();
    }
  });

  it('una referencia de plantilla incompleta no se encola', async () => {
    for (const whatsappTemplate of [
      { name: 'notificacion_48h' },
      { language: 'es_MX', name: '' },
      { language: '', name: 'notificacion_48h' },
      'notificacion_48h'
    ]) {
      const { enqueueOutbound, servicio } = crearServicio({ habilitado: true });
      await expect(
        servicio.send('Bearer token', {
          conversationId: 'conv-1',
          idempotencyKey: UUID,
          whatsappTemplate
        })
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(enqueueOutbound, JSON.stringify(whatsappTemplate)).not.toHaveBeenCalled();
    }
  });
});

/** Referencia de tipo para que el import no quede sin usar si el archivo cambia. */
export type ServicioDeMensajes = ToolMessagesService;
