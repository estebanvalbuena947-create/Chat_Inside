import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { ConversionService } from '../conversions/conversion.service';
import type { ToolTokenService } from './tool-token.service';
import { ToolConversionsService } from './tool-conversions.service';

/**
 * Conversiones ganadas del bot.
 *
 * La prueba que importa es la que comprueba que NO se encola nada cuando la conversacion no existe:
 * un evento encolado sin conversacion se quedaria en la cola sin poder enviarse nunca, y nadie lo
 * notaria hasta mirar la tabla.
 */

function crearServicio(
  opciones: { conversacion?: { id: string } | null; resultado?: unknown } = {}
) {
  const conversacion =
    opciones.conversacion === undefined ? { id: 'conv-1' } : opciones.conversacion;
  const enqueueWonConversion = vi.fn().mockResolvedValue(opciones.resultado ?? { queued: true });
  const maybeSingle = vi.fn().mockResolvedValue({ data: conversacion, error: null });
  const segundoEq = vi.fn(() => ({ maybeSingle }));
  const primerEq = vi.fn(() => ({ eq: segundoEq }));
  const supabase = { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: primerEq })) })) };

  const toolTokenService = {
    assertScope: vi.fn(),
    authenticate: vi.fn().mockResolvedValue({
      scopes: ['conversations'],
      tenantId: 'tenant-1',
      tokenId: 'token-1'
    })
  };

  const servicio = new ToolConversionsService(
    toolTokenService as unknown as ToolTokenService,
    { enqueueWonConversion } as unknown as ConversionService,
    { create: () => supabase } as never
  );

  return { enqueueWonConversion, servicio, toolTokenService };
}

const cuerpoValido = { amount: 1998, conversationId: 'conv-1' };

describe('conversiones del bot', () => {
  it('encola la conversion con el importe, la moneda por defecto y la fecha actual', async () => {
    const { enqueueWonConversion, servicio } = crearServicio();

    const resultado = await servicio.enqueue('Bearer token', cuerpoValido);

    expect(resultado).toMatchObject({
      conversationId: 'conv-1',
      queued: true,
      tenantId: 'tenant-1'
    });
    const enviado = enqueueWonConversion.mock.calls[0][0];
    expect(enviado).toMatchObject({
      amount: 1998,
      conversationId: 'conv-1',
      currency: 'MXN',
      tenantId: 'tenant-1'
    });
    expect(typeof enviado.occurredAt).toBe('string');
  });

  it('respeta la moneda y la fecha si el flujo las manda', async () => {
    const { enqueueWonConversion, servicio } = crearServicio();

    await servicio.enqueue('Bearer token', {
      ...cuerpoValido,
      currency: 'usd',
      occurredAt: '2026-10-07T15:00:00.000Z'
    });

    expect(enqueueWonConversion.mock.calls[0][0]).toMatchObject({
      currency: 'USD',
      occurredAt: '2026-10-07T15:00:00.000Z'
    });
  });

  it('NO encola cuando la conversacion no existe en el espacio', async () => {
    const { enqueueWonConversion, servicio } = crearServicio({ conversacion: null });

    await expect(servicio.enqueue('Bearer token', cuerpoValido)).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(enqueueWonConversion).not.toHaveBeenCalled();
  });

  it('rechaza un importe que no es un numero valido', async () => {
    const { enqueueWonConversion, servicio } = crearServicio();

    for (const amount of ['mucho', -5, Number.NaN]) {
      await expect(
        servicio.enqueue('Bearer token', { ...cuerpoValido, amount })
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    }
    await expect(
      servicio.enqueue('Bearer token', { conversationId: 'conv-1' })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(enqueueWonConversion).not.toHaveBeenCalled();
  });

  it('rechaza un cuerpo sin conversacion', async () => {
    const { enqueueWonConversion, servicio } = crearServicio();

    await expect(servicio.enqueue('Bearer token', { amount: 100 })).rejects.toBeInstanceOf(
      UnprocessableEntityException
    );
    expect(enqueueWonConversion).not.toHaveBeenCalled();
  });

  it('exige el alcance de conversaciones', async () => {
    const { servicio, toolTokenService } = crearServicio();

    await servicio.enqueue('Bearer token', cuerpoValido);

    expect(toolTokenService.assertScope).toHaveBeenCalledWith(
      { scopes: ['conversations'], tenantId: 'tenant-1', tokenId: 'token-1' },
      'conversations'
    );
  });

  it('informa el motivo cuando la integracion esta apagada, sin fallar', async () => {
    const { servicio } = crearServicio({
      resultado: { queued: false, reason: 'La integracion de conversiones no esta activa.' }
    });

    await expect(servicio.enqueue('Bearer token', cuerpoValido)).resolves.toMatchObject({
      queued: false,
      reason: 'La integracion de conversiones no esta activa.'
    });
  });
});
