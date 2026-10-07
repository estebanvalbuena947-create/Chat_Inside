import { UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { ToolContactFieldsService } from './tool-contact-fields.service';
import type { ToolTokenService } from './tool-token.service';

/**
 * Campos por contacto.
 *
 * Dos pruebas sostienen el contrato: que un contacto de OTRO espacio no reciba escrituras, y que
 * escribir dos veces actualice en lugar de duplicar. La primera protege datos ajenos; la segunda
 * protege los del propio negocio.
 */

const CAMPOS_DEVUELTOS = [{ field_name: 'monto_pagado', field_value: '500' }];

function crearServicio(opciones: { contactoExiste?: boolean } = {}) {
  const upsert = vi.fn((_filas: unknown, _opciones?: unknown) => ({
    select: vi.fn().mockResolvedValue({ data: CAMPOS_DEVUELTOS, error: null })
  }));
  const order = vi.fn().mockResolvedValue({ data: CAMPOS_DEVUELTOS, error: null });

  const supabase = {
    from: vi.fn((tabla: string) => {
      if (tabla === 'contacts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: opciones.contactoExiste === false ? null : { id: 'contact-1' },
                  error: null
                })
              }))
            }))
          }))
        };
      }
      return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ order })) })) })),
        upsert
      };
    })
  };

  const toolTokenService = {
    assertScope: vi.fn(),
    authenticate: vi.fn().mockResolvedValue({
      scopes: ['conversations'],
      tenantId: 'tenant-1',
      tokenId: 'token-1'
    })
  };

  const servicio = new ToolContactFieldsService(
    toolTokenService as unknown as ToolTokenService,
    { create: () => supabase } as unknown as SupabaseServerClientFactory
  );

  return { servicio, toolTokenService, upsert };
}

describe('campos por contacto', () => {
  it('escribe los campos en el espacio del token', async () => {
    const { servicio, upsert } = crearServicio();

    const resultado = await servicio.write('Bearer token', {
      contactId: 'contact-1',
      fields: [{ field_name: 'monto_pagado', field_value: 500 }]
    });

    expect(upsert).toHaveBeenCalledTimes(1);
    const filas = upsert.mock.calls[0]?.[0] as Array<Record<string, unknown>>;
    expect(filas[0]).toMatchObject({
      contact_id: 'contact-1',
      field_name: 'monto_pagado',
      field_value: '500',
      tenant_id: 'tenant-1'
    });
    expect(resultado).toMatchObject({ contactId: 'contact-1', tenantId: 'tenant-1' });
  });

  it('actualiza en lugar de duplicar: usa la clave unica del contacto y el campo', async () => {
    const { servicio, upsert } = crearServicio();

    await servicio.write('Bearer token', {
      contactId: 'contact-1',
      fields: [{ field_name: 'Parte 1', field_value: 'pagado' }]
    });

    expect(upsert.mock.calls[0]?.[1]).toEqual({ onConflict: 'contact_id,field_name' });
  });

  it('NO escribe en la ficha de un contacto de otro espacio', async () => {
    const { servicio, upsert } = crearServicio({ contactoExiste: false });

    await expect(
      servicio.write('Bearer token', {
        contactId: 'contacto-ajeno',
        fields: [{ field_name: 'monto_pagado', field_value: '500' }]
      })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(upsert).not.toHaveBeenCalled();
  });

  it('rechaza una escritura sin contacto o sin campos validos', async () => {
    const { servicio, upsert } = crearServicio();

    await expect(servicio.write('Bearer token', { fields: [] })).rejects.toBeInstanceOf(
      UnprocessableEntityException
    );
    await expect(
      servicio.write('Bearer token', { contactId: 'contact-1', fields: [] })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      servicio.write('Bearer token', { contactId: 'contact-1', fields: [{ field_name: '   ' }] })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    await expect(
      servicio.write('Bearer token', {
        contactId: 'contact-1',
        fields: [{ field_name: 'x'.repeat(80) }]
      })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(upsert).not.toHaveBeenCalled();
  });

  it('exige el permiso de conversaciones, que es el que cubre al contacto', async () => {
    const { servicio, toolTokenService } = crearServicio();

    await servicio.read('Bearer token', 'contact-1');

    expect(toolTokenService.assertScope).toHaveBeenCalledWith(
      { scopes: ['conversations'], tenantId: 'tenant-1', tokenId: 'token-1' },
      'conversations'
    );
  });

  it('lee los campos de un contacto del espacio', async () => {
    const { servicio } = crearServicio();

    const resultado = await servicio.read('Bearer token', 'contact-1');

    expect(resultado).toMatchObject({ contactId: 'contact-1', tenantId: 'tenant-1' });
    expect((resultado as { fields: unknown[] }).fields).toHaveLength(1);
  });
});
