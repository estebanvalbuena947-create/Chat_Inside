import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { crearClienteSupabase, type RespuestaTabla } from './supabase-chain.fixture';
import { ToolBranchesService } from './tool-branches.service';
import type { ToolTokenService } from './tool-token.service';

/**
 * Sede: listado, catalogo de imagenes y precios.
 *
 * Tres cosas se comprueban aqui, y son las que pueden hacer dano si se rompen:
 *   1. El aislamiento: la sede se busca dentro del espacio del token. Si esa condicion cayera, un
 *      slug de otro negocio devolveria su catalogo y sus precios, que son datos de un tercero.
 *   2. La forma de los precios: importe y unidad por separado. Si se devolviera una cadena
 *      formateada, el bot no podria distinguir "por persona" de "en total".
 *   3. El canal: una imagen sin canal sirve en cualquier sitio, una de Instagram no vale para TikTok.
 *
 * El doble es el compartido (supabase-chain.fixture): reproduce la cadena de Supabase tal como es
 * --encadenable y esperable-- y anota las llamadas por tabla. Antes este archivo tenia su propia
 * version, con `order` devolviendo una promesa, y fallo justo por eso.
 */

const SEDE = { id: 'branch-1', name: 'Valle', slug: 'valle' };
const SEDE_LOMAS = { id: 'branch-2', name: 'Lomas', slug: 'lomas' };

const IMAGEN = {
  id: 'm1',
  kind: 'image',
  sort_order: 1,
  storage_object_path: 't/valle/foto.jpg',
  title: 'Masaje'
};

const SERVICIOS = [
  {
    code: 'anticipo',
    currency: 'MXN',
    id: 's1',
    name: 'Anticipo',
    notes: null,
    price: '500.00',
    price_unit: 'per_person',
    sort_order: 1
  },
  {
    code: 'pareja',
    currency: 'MXN',
    id: 's2',
    name: 'Pareja',
    notes: null,
    price: '1998.00',
    price_unit: 'total',
    sort_order: 3
  }
];

function crearServicio(
  opciones: {
    fallaFirma?: boolean;
    listarSedes?: boolean;
    sedeExiste?: boolean;
    sinMultimedia?: boolean;
  } = {}
) {
  const createSignedUrls = vi.fn().mockResolvedValue(
    opciones.fallaFirma
      ? { data: null, error: { message: 'almacen no disponible' } }
      : {
          data: [{ path: 't/valle/foto.jpg', signedUrl: 'https://ejemplo/firmada' }],
          error: null
        }
  );

  // `branches` responde de dos formas segun quien pregunte: una sede suelta (resolveBranch) o la
  // lista (listBranches). Se declara por turnos para que cada prueba reciba lo suyo.
  const respuestaSedes: RespuestaTabla[] =
    opciones.sedeExiste === false
      ? [{ data: null, error: null }]
      : opciones.listarSedes
        ? [{ data: [SEDE, SEDE_LOMAS], error: null }]
        : [{ data: SEDE, error: null }];

  const { cliente, argumentosDe, llamadasDe } = crearClienteSupabase({
    branch_media: { data: opciones.sinMultimedia ? [] : [IMAGEN], error: null },
    branch_services: { data: SERVICIOS, error: null },
    branches: respuestaSedes
  });

  const supabase = {
    ...cliente,
    storage: { from: vi.fn(() => ({ createSignedUrls })) }
  };

  const toolTokenService = {
    assertScope: vi.fn(),
    authenticate: vi.fn().mockResolvedValue({
      scopes: ['media'],
      tenantId: 'tenant-1',
      tokenId: 'token-1'
    })
  };

  const servicio = new ToolBranchesService(
    toolTokenService as unknown as ToolTokenService,
    { create: () => supabase } as unknown as SupabaseServerClientFactory
  );

  return { argumentosDe, createSignedUrls, llamadasDe, servicio, toolTokenService };
}

describe('sede: listado', () => {
  it('devuelve las sedes activas con su nombre y su slug', async () => {
    const { servicio } = crearServicio({ listarSedes: true });

    const resultado = (await servicio.listBranches('Bearer token')) as {
      branches: Array<{ name: string; slug: string }>;
      tenantId: string;
    };

    expect(resultado.tenantId).toBe('tenant-1');
    expect(resultado.branches).toEqual([
      { id: 'branch-1', name: 'Valle', slug: 'valle' },
      { id: 'branch-2', name: 'Lomas', slug: 'lomas' }
    ]);
  });

  it('el listado solo pide sedes activas del espacio', async () => {
    const { llamadasDe, servicio } = crearServicio({ listarSedes: true });

    await servicio.listBranches('Bearer token');

    // Las dos condiciones se piden con eq, no con un metodo aparte: se comprueban sus argumentos.
    const condiciones = llamadasDe('branches')
      .filter((llamada) => llamada.metodo === 'eq')
      .map((llamada) => llamada.args);
    expect(condiciones).toContainEqual(['tenant_id', 'tenant-1']);
    expect(condiciones).toContainEqual(['is_active', true]);
  });
});

describe('sede: catalogo y precios', () => {
  it('exige el permiso de multimedia antes de consultar nada', async () => {
    const { servicio, toolTokenService } = crearServicio();

    await servicio.listMedia('Bearer token', 'valle');

    expect(toolTokenService.assertScope).toHaveBeenCalledWith(
      { scopes: ['media'], tenantId: 'tenant-1', tokenId: 'token-1' },
      'media'
    );
  });

  it('una sede que no existe en el espacio del token da 404 y no devuelve datos ajenos', async () => {
    const { servicio } = crearServicio({ sedeExiste: false });

    await expect(servicio.listMedia('Bearer token', 'ajena')).rejects.toBeInstanceOf(
      NotFoundException
    );
    await expect(servicio.listServices('Bearer token', 'ajena')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('el catalogo devuelve la sede, sus imagenes y una direccion firmada por cada una', async () => {
    const { createSignedUrls, servicio } = crearServicio();

    const resultado = (await servicio.listMedia('Bearer token', 'valle')) as {
      branch: { name: string; slug: string };
      items: Array<{ title: string | null; url: string | null }>;
      tenantId: string;
    };

    expect(resultado.branch).toMatchObject({ name: 'Valle', slug: 'valle' });
    expect(resultado.tenantId).toBe('tenant-1');
    expect(resultado.items).toHaveLength(1);
    expect(resultado.items[0]?.url).toBe('https://ejemplo/firmada');
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
  });

  it('una galeria vacia no es un error: devuelve la sede sin elementos y no pide firmas', async () => {
    const { createSignedUrls, servicio } = crearServicio({ sinMultimedia: true });

    const resultado = (await servicio.listMedia('Bearer token', 'valle')) as { items: unknown[] };

    expect(resultado.items).toHaveLength(0);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it('si el almacen falla, avisa en lugar de devolver imagenes sin direccion', async () => {
    const { servicio } = crearServicio({ fallaFirma: true });

    await expect(servicio.listMedia('Bearer token', 'valle')).rejects.toThrow();
  });

  it('los precios vuelven con importe y unidad por separado, no formateados', async () => {
    const { servicio } = crearServicio();

    const resultado = (await servicio.listServices('Bearer token', 'valle')) as {
      services: Array<{ code: string; price: number | null; priceUnit: string }>;
    };

    const anticipo = resultado.services.find((s) => s.code === 'anticipo');
    const pareja = resultado.services.find((s) => s.code === 'pareja');

    expect(anticipo).toMatchObject({ price: 500, priceUnit: 'per_person' });
    expect(pareja).toMatchObject({ price: 1998, priceUnit: 'total' });
  });
});

describe('catalogo por canal', () => {
  it('con canal pide las suyas y las comunes', async () => {
    const { argumentosDe, servicio } = crearServicio();

    await servicio.listMedia('Bearer token', 'valle', 'tiktok');

    expect(argumentosDe('branch_media', 'in')).toEqual(['channel', ['any', 'tiktok']]);
  });

  it('sin canal no filtra: se devuelve todo', async () => {
    const { llamadasDe, servicio } = crearServicio();

    await servicio.listMedia('Bearer token', 'valle');

    expect(llamadasDe('branch_media').some((l) => l.metodo === 'in')).toBe(false);
  });
});
