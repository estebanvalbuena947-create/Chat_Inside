import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import type { TenantMessageService } from '../conversations/tenant-message.service';
import { ToolMessagesService } from './tool-messages.service';
import type { ToolTokenService } from './tool-token.service';

/**
 * Envio con plantilla.
 *
 * La prueba que mas importa: si a la plantilla le falta un valor, NO se envia. Rellenar los huecos
 * es cosa del servidor justamente para que un dato ausente no acabe a la vista del cliente como un
 * "{fecha}" literal, sin error y sin rastro.
 *
 * El doble responde por tabla, no por orden de llamada: asi cada prueba dice exactamente que hay en
 * la base, y no depende de cuantas consultas haga antes el servicio.
 */

const UUID = '6b1f4c2e-9d3a-4f58-8b7c-1e2d3f4a5b6c';
const PLANTILLA = 'Hola {nombre}, tu cita en {sede} es el {fecha}.';

function crearServicio(opciones: { activo?: boolean; plantilla?: string | null } = {}) {
  const enqueueOutbound = vi.fn().mockResolvedValue({ item: { id: 'msg-1' } });

  const tablas: Record<string, unknown> = {
    bot_integrations: { data: { sending_enabled: opciones.activo !== false }, error: null },
    message_templates: {
      data: opciones.plantilla === null ? null : { body: opciones.plantilla ?? PLANTILLA },
      error: null
    }
  };

  const cadena = (tabla: string): Record<string, unknown> => {
    const resultado = tablas[tabla] ?? { data: null, error: null };
    const encadenable: Record<string, unknown> = {
      eq: () => encadenable,
      in: () => encadenable,
      maybeSingle: () => Promise.resolve(resultado),
      select: () => encadenable,
      then: (resolver: (valor: unknown) => unknown) => Promise.resolve(resultado).then(resolver)
    };
    return encadenable;
  };

  const supabase = { from: vi.fn((tabla: string) => cadena(tabla)) };

  const servicio = new ToolMessagesService(
    {
      assertScope: vi.fn(),
      authenticate: vi.fn().mockResolvedValue({
        scopes: ['messages'],
        tenantId: 'tenant-1',
        tokenId: 'token-1'
      })
    } as unknown as ToolTokenService,
    { enqueueOutbound } as unknown as TenantMessageService,
    { create: () => supabase } as unknown as SupabaseServerClientFactory
  );

  return { enqueueOutbound, servicio };
}

describe('envio con plantilla', () => {
  it('rellena los huecos con los valores y encola el texto final', async () => {
    const { enqueueOutbound, servicio } = crearServicio();

    await servicio.send('Bearer token', {
      conversationId: 'conv-1',
      idempotencyKey: UUID,
      templateName: 'confirmacion_ig',
      variables: { fecha: '21 de noviembre', nombre: 'Martha', sede: 'Polanco' }
    });

    expect(enqueueOutbound).toHaveBeenCalledTimes(1);
    const command = (enqueueOutbound.mock.calls[0]?.[0] as { command: { body: string } }).command;
    expect(command.body).toBe('Hola Martha, tu cita en Polanco es el 21 de noviembre.');
  });

  it('si falta un valor NO envia, y dice cual falta', async () => {
    const { enqueueOutbound, servicio } = crearServicio();

    await expect(
      servicio.send('Bearer token', {
        conversationId: 'conv-1',
        idempotencyKey: UUID,
        templateName: 'confirmacion_ig',
        variables: { nombre: 'Martha' }
      })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(enqueueOutbound).not.toHaveBeenCalled();
  });

  it('un valor vacio cuenta como ausente', async () => {
    const { enqueueOutbound, servicio } = crearServicio();

    await expect(
      servicio.send('Bearer token', {
        conversationId: 'conv-1',
        idempotencyKey: UUID,
        templateName: 'confirmacion_ig',
        variables: { fecha: '   ', nombre: 'Martha', sede: 'Polanco' }
      })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(enqueueOutbound).not.toHaveBeenCalled();
  });

  it('una plantilla que no existe no envia nada', async () => {
    const { enqueueOutbound, servicio } = crearServicio({ plantilla: null });

    await expect(
      servicio.send('Bearer token', {
        conversationId: 'conv-1',
        idempotencyKey: UUID,
        templateName: 'no-existe',
        variables: { nombre: 'Martha', sede: 'Polanco', fecha: '21 de noviembre' }
      })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(enqueueOutbound).not.toHaveBeenCalled();
  });

  it('el texto directo sigue funcionando sin plantilla', async () => {
    const { enqueueOutbound, servicio } = crearServicio();

    await servicio.send('Bearer token', {
      conversationId: 'conv-1',
      idempotencyKey: UUID,
      text: 'Un mensaje escrito a mano'
    });

    const command = (enqueueOutbound.mock.calls[0]?.[0] as { command: { body: string } }).command;
    expect(command.body).toBe('Un mensaje escrito a mano');
  });

  it('con el interruptor apagado no rellena ni envia', async () => {
    const { enqueueOutbound, servicio } = crearServicio({ activo: false });

    await expect(
      servicio.send('Bearer token', {
        conversationId: 'conv-1',
        idempotencyKey: UUID,
        templateName: 'confirmacion_ig',
        variables: { nombre: 'Martha', sede: 'Polanco', fecha: '21 de noviembre' }
      })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(enqueueOutbound).not.toHaveBeenCalled();
  });
});
