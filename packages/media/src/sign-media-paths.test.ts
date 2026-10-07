import { describe, expect, it, vi } from 'vitest';
import type { SupabaseLikeSigner } from './sign-media-paths';
import { signMediaPaths } from './sign-media-paths';

/**
 * Firma en lote.
 *
 * Lo que se comprueba aqui no es que sepa firmar --eso es del almacen-- sino el reparto: que no
 * salga ninguna ruta interna, que no se firme dos veces lo mismo, y que un fallo del almacen
 * **lance** en vez de devolver una galeria de imagenes rotas sin que nadie se entere.
 */

function montar(opciones: { falla?: boolean } = {}) {
  const createSignedUrls = vi.fn(async (rutas: string[], ttl: number) =>
    opciones.falla
      ? { data: null, error: { message: 'almacen no disponible' } }
      : {
          data: rutas.map((path) => ({ path, signedUrl: `https://ejemplo/${path}?t=${ttl}` })),
          error: null
        }
  );
  const signer: SupabaseLikeSigner = {
    storage: { from: vi.fn(() => ({ createSignedUrls })) }
  };
  return { createSignedUrls, signer };
}

describe('firma en lote', () => {
  it('devuelve un enlace por ruta', async () => {
    const { signer } = montar();

    const firmadas = await signMediaPaths({
      bucket: 'branch-media',
      paths: ['t/sede/a.jpg', 't/sede/b.jpg'],
      signer,
      ttlSeconds: 600
    });

    expect(firmadas.get('t/sede/a.jpg')).toBe('https://ejemplo/t/sede/a.jpg?t=600');
    expect(firmadas.size).toBe(2);
  });

  it('no firma dos veces la misma ruta', async () => {
    const { createSignedUrls, signer } = montar();

    await signMediaPaths({
      bucket: 'branch-media',
      paths: ['t/sede/a.jpg', 't/sede/a.jpg', 't/sede/a.jpg'],
      signer,
      ttlSeconds: 600
    });

    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect((createSignedUrls.mock.calls[0]?.[0] as string[]).length).toBe(1);
  });

  it('sin rutas no molesta al almacen', async () => {
    const { createSignedUrls, signer } = montar();

    const firmadas = await signMediaPaths({
      bucket: 'branch-media',
      paths: [],
      signer,
      ttlSeconds: 600
    });

    expect(firmadas.size).toBe(0);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it('las rutas vacias se ignoran, y si solo hay vacias tampoco se llama', async () => {
    const { createSignedUrls, signer } = montar();

    const firmadas = await signMediaPaths({
      bucket: 'branch-media',
      paths: ['', '   '],
      signer,
      ttlSeconds: 600
    });

    expect(firmadas.size).toBe(0);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });

  it('si el almacen falla, lanza en vez de devolver imagenes sin direccion', async () => {
    const { signer } = montar({ falla: true });

    await expect(
      signMediaPaths({
        bucket: 'branch-media',
        paths: ['t/sede/a.jpg'],
        signer,
        ttlSeconds: 600
      })
    ).rejects.toThrow();
  });

  it('el bucket y el plazo son los de quien llama', async () => {
    const { createSignedUrls, signer } = montar();

    await signMediaPaths({
      bucket: 'conversation-media',
      paths: ['t/c/m/1.jpg'],
      signer,
      ttlSeconds: 900
    });

    expect(createSignedUrls).toHaveBeenCalledWith(['t/c/m/1.jpg'], 900);
    expect(signer.storage.from).toHaveBeenCalledWith('conversation-media');
  });
});
