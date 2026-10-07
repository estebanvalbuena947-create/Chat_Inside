import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { crearClienteSupabase } from '../tools/supabase-chain.fixture';
import type { TenantAccessService } from '../tenants/tenant-access.service';
import type { RequestAuthenticator } from '../auth/request-authenticator';
import { BranchMediaService } from './branch-media.service';

/**
 * Importar multimedia a una sede.
 *
 * La prueba que mas importa es la del aislamiento: un slug de otro negocio no puede existir, y
 * cuando no existe NO se descarga nada. Si esa condicion cayera, cualquiera con sesion en un
 * espacio podria traer archivos al catalogo de un tercero.
 *
 * La descarga se sustituye por un doble: una prueba no debe salir a internet. Lo que se comprueba
 * aqui es el reparto -- quien decide, quien valida y que se registra -- no el motor, que ya tiene
 * sus propias pruebas.
 */

const { storeRemoteMedia } = vi.hoisted(() => ({ storeRemoteMedia: vi.fn() }));
// Solo se sustituye lo que sale a internet. El resto del paquete se conserva de verdad: un doble
// que reemplaza un modulo entero es una copia de su interfaz, y cada export nuevo lo rompe. Aqui
// `signMediaPaths` se ejecuta de verdad contra el almacen falso, que es lo que interesa comprobar.
vi.mock('@chat-zernio/media', async () => {
  const real = await vi.importActual<typeof import('@chat-zernio/media')>('@chat-zernio/media');
  return { ...real, storeRemoteMedia };
});

const SEDE = { id: 'branch-1', name: 'Valle', slug: 'valle' };
const GUARDADO = {
  byteSize: 1024,
  contentType: 'image/jpeg',
  extension: 'jpg',
  path: 'tenant-1/branch-1/abc123.jpg'
};

function crearServicio(opciones: { miembro?: boolean; sedeExiste?: boolean } = {}) {
  const { argumentosDe, cliente, llamadasDe } = crearClienteSupabase({
    branch_media: {
      data: {
        id: 'media-1',
        kind: 'image',
        sort_order: 0,
        storage_object_path: GUARDADO.path,
        title: 'Fachada'
      },
      error: null
    },
    branches: { data: opciones.sedeExiste === false ? null : SEDE, error: null }
  });

  const storageUpload = vi.fn(async () => ({ error: null }));
  const supabase = { ...cliente, storage: { from: vi.fn(() => ({ upload: storageUpload })) } };

  const assertMembership = vi.fn(async () => {
    if (opciones.miembro === false) throw new ForbiddenException('Sin pertenencia.');
  });

  const servicio = new BranchMediaService(
    {
      authenticate: vi.fn().mockResolvedValue({ userId: 'user-1' })
    } as unknown as RequestAuthenticator,
    { assertMembership } as unknown as TenantAccessService,
    { create: () => supabase } as unknown as SupabaseServerClientFactory
  );

  return { argumentosDe, assertMembership, llamadasDe, servicio, storageUpload };
}

beforeEach(() => {
  storeRemoteMedia.mockReset();
  storeRemoteMedia.mockResolvedValue(GUARDADO);
});

describe('aislamiento y permisos', () => {
  it('una sede de otro negocio da 404 y no descarga nada', async () => {
    const { servicio, storageUpload } = crearServicio({ sedeExiste: false });

    await expect(
      servicio.importFromUrl('Bearer token', 'tenant-1', {
        branchSlug: 'ajena',
        sourceUrl: 'https://ejemplo/foto.jpg'
      })
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(storeRemoteMedia).not.toHaveBeenCalled();
    expect(storageUpload).not.toHaveBeenCalled();
  });

  it('hace falta pertenecer al espacio', async () => {
    const { servicio } = crearServicio({ miembro: false });

    await expect(
      servicio.importFromUrl('Bearer token', 'tenant-1', {
        branchSlug: 'valle',
        sourceUrl: 'https://ejemplo/foto.jpg'
      })
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(storeRemoteMedia).not.toHaveBeenCalled();
  });

  it('la sede se busca dentro del espacio del token', async () => {
    const { argumentosDe, servicio } = crearServicio();

    await servicio.importFromUrl('Bearer token', 'tenant-1', {
      branchSlug: 'valle',
      sourceUrl: 'https://ejemplo/foto.jpg'
    });

    expect(argumentosDe('branches', 'eq')).toEqual(['tenant_id', 'tenant-1']);
  });
});

describe('entrada', () => {
  it('sin direccion de origen no se llega a descargar', async () => {
    const { servicio } = crearServicio();

    await expect(
      servicio.importFromUrl('Bearer token', 'tenant-1', { branchSlug: 'valle' })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    expect(storeRemoteMedia).not.toHaveBeenCalled();
  });

  it('una sede vacia en el cuerpo tampoco pasa', async () => {
    const { servicio } = crearServicio();

    await expect(
      servicio.importFromUrl('Bearer token', 'tenant-1', {
        branchSlug: '   ',
        sourceUrl: 'https://ejemplo/foto.jpg'
      })
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

describe('lo que se pide al motor', () => {
  it('la ruta es determinista: la misma direccion da el mismo archivo', async () => {
    const { servicio } = crearServicio();

    await servicio.importFromUrl('Bearer token', 'tenant-1', {
      branchSlug: 'valle',
      sourceUrl: 'https://ejemplo/foto.jpg'
    });
    const primera = (storeRemoteMedia.mock.calls[0]?.[0] as { path: (m: unknown) => string }).path;

    storeRemoteMedia.mockClear();
    await servicio.importFromUrl('Bearer token', 'tenant-1', {
      branchSlug: 'valle',
      sourceUrl: 'https://ejemplo/foto.jpg'
    });
    const segunda = (storeRemoteMedia.mock.calls[0]?.[0] as { path: (m: unknown) => string }).path;

    expect(primera(GUARDADO)).toBe(segunda(GUARDADO));
    expect(primera(GUARDADO)).toContain('tenant-1/branch-1/');
  });

  it('el filtro admite imagen y video, y rechaza lo demas', async () => {
    const { servicio } = crearServicio();

    await servicio.importFromUrl('Bearer token', 'tenant-1', {
      branchSlug: 'valle',
      sourceUrl: 'https://ejemplo/foto.jpg'
    });

    const accept = (storeRemoteMedia.mock.calls[0]?.[0] as { accept: (m: unknown) => boolean })
      .accept;
    expect(accept({ contentType: 'image/jpeg' })).toBe(true);
    expect(accept({ contentType: 'video/mp4' })).toBe(true);
    expect(accept({ contentType: 'audio/mpeg' })).toBe(false);
    expect(accept({ contentType: 'application/pdf' })).toBe(false);
  });

  it('el bucket es el de sedes', async () => {
    const { servicio } = crearServicio();

    await servicio.importFromUrl('Bearer token', 'tenant-1', {
      branchSlug: 'valle',
      sourceUrl: 'https://ejemplo/foto.jpg'
    });

    expect(storeRemoteMedia.mock.calls[0]?.[0]).toMatchObject({ bucket: 'branch-media' });
  });
});

describe('el registro', () => {
  it('guarda la fila y devuelve lo que hace falta para pintarla', async () => {
    const { servicio } = crearServicio();

    const resultado = (await servicio.importFromUrl('Bearer token', 'tenant-1', {
      branchSlug: 'valle',
      sourceUrl: 'https://ejemplo/foto.jpg',
      title: 'Fachada'
    })) as Record<string, unknown>;

    expect(resultado.id).toBe('media-1');
    expect(resultado.kind).toBe('image');
    expect(resultado.title).toBe('Fachada');
  });

  it('la ruta interna del almacen no sale en la respuesta', async () => {
    const { servicio } = crearServicio();

    const resultado = (await servicio.importFromUrl('Bearer token', 'tenant-1', {
      branchSlug: 'valle',
      sourceUrl: 'https://ejemplo/foto.jpg'
    })) as Record<string, unknown>;

    // El bucket es privado: quien necesite el archivo pide un enlace firmado.
    expect(resultado).not.toHaveProperty('storageObjectPath');
    expect(JSON.stringify(resultado)).not.toContain(GUARDADO.path);
  });
});

/**
 * El listado de administracion.
 *
 * Necesita un almacen que sepa firmar, asi que monta su propio servicio en vez de reusar el
 * ayudante de mas arriba. La asercion que mas importa es la misma que ya se gano el importFromUrl:
 * la ruta interna del almacen no puede salir en la respuesta.
 */
describe('listado de administracion', () => {
  const FILA = {
    id: 'media-1',
    kind: 'image',
    sort_order: 2,
    storage_object_path: 'tenant-1/branch-1/abc123.jpg',
    title: 'Fachada'
  };

  function montar(opciones: { sedeExiste?: boolean; sinFilas?: boolean } = {}) {
    const { cliente, llamadasDe } = crearClienteSupabase({
      branch_media: { data: opciones.sinFilas ? [] : [FILA], error: null },
      branches: { data: opciones.sedeExiste === false ? null : SEDE, error: null }
    });

    const createSignedUrls = vi.fn(async () => ({
      data: [{ path: FILA.storage_object_path, signedUrl: 'https://ejemplo/firmada' }],
      error: null
    }));
    const supabase = { ...cliente, storage: { from: vi.fn(() => ({ createSignedUrls })) } };

    const servicio = new BranchMediaService(
      {
        authenticate: vi.fn().mockResolvedValue({ userId: 'user-1' })
      } as unknown as RequestAuthenticator,
      { assertMembership: vi.fn(async () => undefined) } as unknown as TenantAccessService,
      { create: () => supabase } as unknown as SupabaseServerClientFactory
    );

    return { createSignedUrls, llamadasDe, servicio };
  }

  it('devuelve el material de la sede con un enlace firmado por archivo', async () => {
    const { servicio } = montar();

    const resultado = (await servicio.list('Bearer token', 'tenant-1', 'valle')) as {
      branch: { slug: string };
      items: Array<Record<string, unknown>>;
    };

    expect(resultado.branch.slug).toBe('valle');
    expect(resultado.items).toHaveLength(1);
    expect(resultado.items[0]?.title).toBe('Fachada');
    expect(resultado.items[0]?.url).toBe('https://ejemplo/firmada');
  });

  it('la ruta interna del almacen NO sale en el listado', async () => {
    const { servicio } = montar();

    const resultado = await servicio.list('Bearer token', 'tenant-1', 'valle');

    expect(JSON.stringify(resultado)).not.toContain(FILA.storage_object_path);
    expect((resultado as { items: Array<Record<string, unknown>> }).items[0]).not.toHaveProperty(
      'storageObjectPath'
    );
  });

  it('pide el material ordenado por su orden', async () => {
    const { llamadasDe, servicio } = montar();

    await servicio.list('Bearer token', 'tenant-1', 'valle');

    expect(llamadasDe('branch_media').some((llamada) => llamada.metodo === 'order')).toBe(true);
  });

  it('una sede de otro negocio da 404', async () => {
    const { servicio } = montar({ sedeExiste: false });

    await expect(servicio.list('Bearer token', 'tenant-1', 'ajena')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('sin material no pide firmas ni inventa elementos', async () => {
    const { createSignedUrls, servicio } = montar({ sinFilas: true });

    const resultado = (await servicio.list('Bearer token', 'tenant-1', 'valle')) as {
      items: unknown[];
    };

    expect(resultado.items).toHaveLength(0);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });
});
