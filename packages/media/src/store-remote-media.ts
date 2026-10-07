import { fetchRemoteMedia, type RemoteFile } from './remote-media';

/**
 * Guardar en el almacen propio un archivo que vive en una direccion externa.
 *
 * Existe porque el mismo par --descargar de fuera, subir a un bucket privado-- estaba escrito tres
 * veces: los adjuntos de las conversaciones, los avatares de los contactos y la multimedia de las
 * sedes. Las tres copias repetian el limite de tamano, el timeout, el `upsert` y la regla de
 * devolver `null` en vez de lanzar.
 *
 * Lo que NO decide esta funcion, porque cambia en cada caso:
 *   - el bucket,
 *   - de que tamano es el limite y cuanto se espera,
 *   - la ruta dentro del bucket (un ordinal, un hash de la direccion, una sede),
 *   - si se acepta cualquier contenido o solo algunos.
 *
 * Lo que SI decide, y por eso vive aqui una sola vez:
 *   - que la descarga sea segura (solo https, sin credenciales, sin direcciones privadas),
 *   - que el tipo se reconozca por los bytes y no por lo que declare el proveedor,
 *   - que un fallo sea `null` y nunca una excepcion.
 *
 * El almacen entra como una interfaz minima para que este paquete no dependa de Supabase: quien
 * llama pasa su cliente, y las pruebas pasan un doble.
 */
export type MediaStorage = {
  upload(input: {
    bucket: string;
    bytes: Buffer;
    contentType: string;
    path: string;
  }): Promise<boolean>;
};

export type StoredMedia = {
  byteSize: number;
  contentType: string;
  extension: string;
  path: string;
};

export async function storeRemoteMedia(input: {
  /** Filtro opcional sobre el contenido ya reconocido. Sin filtro se acepta cualquiera. */
  accept?: (media: RemoteFile) => boolean;
  bucket: string;
  /**
   * La descarga, sustituible. En produccion es la de verdad; en las pruebas, un doble, para no
   * salir a internet ni depender de que un servidor ajeno responda.
   */
  fetchMedia?: typeof fetchRemoteMedia;
  maxBytes: number;
  /** La ruta dentro del bucket, que decide quien llama a partir del archivo reconocido. */
  path: (media: RemoteFile) => string;
  sourceUrl: string;
  storage: MediaStorage;
  timeoutMs: number;
}): Promise<StoredMedia | null> {
  const descargar = input.fetchMedia ?? fetchRemoteMedia;
  const media = await descargar({
    maxBytes: input.maxBytes,
    sourceUrl: input.sourceUrl,
    timeoutMs: input.timeoutMs
  });
  if (!media) return null;
  if (input.accept && !input.accept(media)) return null;

  const path = input.path(media);
  const subido = await input.storage.upload({
    bucket: input.bucket,
    bytes: media.bytes,
    contentType: media.contentType,
    path
  });
  if (!subido) return null;

  return {
    byteSize: media.bytes.length,
    contentType: media.contentType,
    extension: media.extension,
    path
  };
}
