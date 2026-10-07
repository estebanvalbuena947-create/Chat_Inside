import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { ToolTemplatesService, readPlaceholders } from './tool-templates.service';
import type { ToolTokenService } from './tool-token.service';

/**
 * Plantillas de mensaje.
 *
 * Dos cosas se sostienen aqui:
 *   1. Los huecos. El texto guarda {fecha}, {sede}... y el servicio dice CUALES son, para que quien
 *      envia sepa que rellenar sin tener que interpretar el texto. Una plantilla sin sus huecos
 *      declarados obliga al flujo a adivinar.
 *   2. El filtro por canal: una plantilla comun ('any') vale en cualquier sitio, una de Instagram no
 *      vale en TikTok. Si el filtro se rompiera, el bot mandaria un texto de Instagram por TikTok.
 */

const PLANTILLA = {
  body: 'Hola {nombre}, tu cita en {sede} es el {fecha} a las {hora}. Hasta pronto, {nombre}.',
  channel: 'instagram',
  code: 'confirmacion_ig',
  name: 'Confirmacion Instagram',
  sort_order: 1
};

function crearServicio(opciones: { existe?: boolean } = {}) {
  const order = vi.fn();
  const inFn = vi.fn();
  let paso = 0;

  const siguiente = () =>
    Promise.resolve({
      data: opciones.existe === false ? [] : [PLANTILLA],
      error: null
    });

  const cadena = (): Record<string, unknown> => {
    const encadenable: Record<string, unknown> = {
      eq: () => encadenable,
      in: (...args: unknown[]) => {
        inFn(...args);
        return encadenable;
      },
      maybeSingle: () =>
        Promise.resolve({ data: opciones.existe === false ? null : PLANTILLA, error: null }),
      order: (...args: unknown[]) => {
        order(...args);
        return encadenable;
      },
      select: () => encadenable,
      then: (resolver: (valor: unknown) => unknown) => {
        paso += 1;
        return siguiente().then(resolver);
      }
    };
    return encadenable;
  };

  const supabase = { from: vi.fn(() => cadena()) };

  const toolTokenService = {
    assertScope: vi.fn(),
    authenticate: vi.fn().mockResolvedValue({
      scopes: ['messages'],
      tenantId: 'tenant-1',
      tokenId: 'token-1'
    })
  };

  const servicio = new ToolTemplatesService(
    toolTokenService as unknown as ToolTokenService,
    { create: () => supabase } as unknown as SupabaseServerClientFactory
  );

  void paso;
  return { inFn, order, servicio, toolTokenService };
}

describe('huecos de una plantilla', () => {
  it('extrae los huecos sin repetir y en el orden en que aparecen', () => {
    expect(readPlaceholders(PLANTILLA.body)).toEqual(['nombre', 'sede', 'fecha', 'hora']);
  });

  it('un texto sin huecos devuelve una lista vacia', () => {
    expect(readPlaceholders('Hola, gracias por escribirnos.')).toEqual([]);
  });

  it('no confunde las llaves vacias ni los espacios', () => {
    expect(readPlaceholders('{ } {} {1mal} {bueno}')).toEqual(['bueno']);
  });
});

describe('plantillas del espacio', () => {
  it('devuelve las plantillas con sus huecos declarados', async () => {
    const { servicio } = crearServicio();

    const resultado = (await servicio.list('Bearer token', undefined)) as {
      templates: Array<{ code: string; placeholders: string[] }>;
      tenantId: string;
    };

    expect(resultado.tenantId).toBe('tenant-1');
    expect(resultado.templates).toHaveLength(1);
    expect(resultado.templates[0]?.code).toBe('confirmacion_ig');
    expect(resultado.templates[0]?.placeholders).toEqual(['nombre', 'sede', 'fecha', 'hora']);
  });

  it('con canal pide las suyas y las comunes, no todas', async () => {
    const { inFn, servicio } = crearServicio();

    await servicio.list('Bearer token', 'instagram');

    expect(inFn).toHaveBeenCalledWith('channel', ['any', 'instagram']);
  });

  it('sin canal no filtra por canal', async () => {
    const { inFn, servicio } = crearServicio();

    await servicio.list('Bearer token', undefined);

    expect(inFn).not.toHaveBeenCalled();
  });

  it('lee una plantilla por su codigo', async () => {
    const { servicio } = crearServicio();

    const resultado = (await servicio.read('Bearer token', 'confirmacion_ig')) as {
      body: string;
      channel: string;
      placeholders: string[];
    };

    expect(resultado.channel).toBe('instagram');
    expect(resultado.placeholders).toContain('fecha');
  });

  it('una plantilla que no existe da 404', async () => {
    const { servicio } = crearServicio({ existe: false });

    await expect(servicio.read('Bearer token', 'no-existe')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('exige el permiso de mensajes antes de leer nada', async () => {
    const { servicio, toolTokenService } = crearServicio();

    await servicio.list('Bearer token', undefined);

    expect(toolTokenService.assertScope).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-1' }),
      'messages'
    );
  });
});
