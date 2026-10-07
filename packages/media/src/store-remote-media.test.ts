import { describe, expect, it, vi } from 'vitest';
import type { RemoteFile } from './remote-media';
import type { MediaStorage } from './store-remote-media';
import { storeRemoteMedia } from './store-remote-media';

/**
 * La pieza compartida de descarga-y-subida.
 *
 * Lo que se comprueba aqui no es que sepa descargar --eso es del motor, y tiene sus pruebas-- sino
 * el reparto: que quien llama manda en la ruta y en el filtro, y que esta funcion manda en las
 * reglas de seguridad. Y sobre todo: que un fallo devuelve `null` y NUNCA deja algo a medias.
 *
 * La descarga se sustituye por un doble: una prueba no debe salir a internet.
 */

const JPEG = {
  bytes: Buffer.from([0xff, 0xd8, 0xff, 0x01]),
  contentType: 'image/jpeg',
  extension: 'jpg'
};
const MP3 = {
  bytes: Buffer.from([0x49, 0x44, 0x33, 0x01]),
  contentType: 'audio/mpeg',
  extension: 'mp3'
};

function montar(opciones: { archivo?: typeof JPEG | null; subidaOk?: boolean } = {}) {
  // Los dobles declaran lo que reciben Y lo que devuelven. Sin argumentos declarados, sus llamadas
  // se tipan como tuplas vacias y `calls[0][0]` es `undefined`; sin el retorno declarado, un campo
  // opcional cuela un `undefined` que no encaja con `RemoteFile | null`.
  const upload = vi.fn(
    async (_entrada: { bucket: string; bytes: Buffer; contentType: string; path: string }) =>
      opciones.subidaOk !== false
  );
  const fetchMedia = vi.fn(
    async (_entrada: {
      maxBytes: number;
      sourceUrl: string;
      timeoutMs: number;
    }): Promise<RemoteFile | null> => ('archivo' in opciones ? (opciones.archivo ?? null) : JPEG)
  );
  const storage: MediaStorage = { upload };

  return { fetchMedia, storage, upload };
}

const base = {
  bucket: 'branch-media',
  maxBytes: 25 * 1024 * 1024,
  path: (media: { extension: string }) => `espacio/sede/archivo.${media.extension}`,
  sourceUrl: 'https://ejemplo/foto',
  timeoutMs: 20_000
};

describe('guardar un archivo remoto', () => {
  it('descarga, sube y devuelve lo guardado', async () => {
    const { fetchMedia, storage, upload } = montar();

    const resultado = await storeRemoteMedia({ ...base, fetchMedia, storage });

    expect(resultado).toEqual({
      byteSize: 4,
      contentType: 'image/jpeg',
      extension: 'jpg',
      path: 'espacio/sede/archivo.jpg'
    });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0]?.[0]).toMatchObject({
      bucket: 'branch-media',
      contentType: 'image/jpeg',
      path: 'espacio/sede/archivo.jpg'
    });
  });

  it('la ruta la decide quien llama, y usa la extension reconocida, no la de la direccion', async () => {
    const { fetchMedia, storage } = montar();
    const ruta = vi.fn((_media: RemoteFile) => 'otra/ruta.jpg');

    await storeRemoteMedia({
      ...base,
      fetchMedia,
      path: ruta,
      sourceUrl: 'https://ejemplo/foto.png',
      storage
    });

    // La direccion dice .png; el archivo es un JPEG. Manda el contenido.
    expect(ruta).toHaveBeenCalledWith(expect.objectContaining({ contentType: 'image/jpeg' }));
    expect(ruta.mock.calls[0]?.[0]?.extension).toBe('jpg');
  });

  it('pasa el limite y el timeout de quien llama al motor de descarga', async () => {
    const { fetchMedia, storage } = montar();

    await storeRemoteMedia({
      ...base,
      fetchMedia,
      maxBytes: 2 * 1024 * 1024,
      storage,
      timeoutMs: 5_000
    });

    expect(fetchMedia).toHaveBeenCalledWith({
      maxBytes: 2 * 1024 * 1024,
      sourceUrl: 'https://ejemplo/foto',
      timeoutMs: 5_000
    });
  });

  it('si la descarga falla NO sube nada', async () => {
    const { fetchMedia, storage, upload } = montar({ archivo: null });

    const resultado = await storeRemoteMedia({ ...base, fetchMedia, storage });

    expect(resultado).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it('el filtro decide: un audio se descarta sin subirlo', async () => {
    const { fetchMedia, storage, upload } = montar({ archivo: MP3 });
    const soloImagen = (media: { contentType: string }) => media.contentType.startsWith('image/');

    const resultado = await storeRemoteMedia({ ...base, accept: soloImagen, fetchMedia, storage });

    expect(resultado).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it('sin filtro se acepta cualquier contenido reconocido', async () => {
    const { fetchMedia, storage } = montar({ archivo: MP3 });

    const resultado = await storeRemoteMedia({ ...base, fetchMedia, storage });

    expect(resultado?.contentType).toBe('audio/mpeg');
    expect(resultado?.extension).toBe('mp3');
  });

  it('si la subida falla devuelve nulo en vez de lanzar', async () => {
    const { fetchMedia, storage } = montar({ subidaOk: false });

    await expect(storeRemoteMedia({ ...base, fetchMedia, storage })).resolves.toBeNull();
  });

  it('sin doble usa la descarga de verdad, y con una direccion invalida devuelve nulo sin salir a la red', async () => {
    const { storage, upload } = montar();

    const resultado = await storeRemoteMedia({
      ...base,
      sourceUrl: 'no-es-una-direccion',
      storage
    });

    expect(resultado).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });
});
