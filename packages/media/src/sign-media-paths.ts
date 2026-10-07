/**
 * Firma en lote las rutas de un bucket privado.
 *
 * Estaba escrito cuatro veces --la galeria de las conversaciones, el catalogo del bot, el
 * despachador de adjuntos y la multimedia de las sedes--, cada copia con su TTL, su deduplicacion de
 * rutas y su forma de reaccionar a un fallo del almacen.
 *
 * Lo que decide quien llama:
 *   - el bucket y cuanto dura el enlace,
 *   - que hacer si el almacen falla: esta funcion **lanza**, y cada camino decide si eso es un error
 *     visible o una galeria sin imagenes.
 *
 * Lo que decide esta funcion, y por eso vive aqui una sola vez:
 *   - que la ruta interna no salga nunca: solo se devuelven enlaces firmados,
 *   - que no se firme dos veces la misma ruta.
 */

/** El firmante de Supabase, visto solo por lo que hace falta. Sin dependencias. */
export type SupabaseLikeSigner = {
  storage: {
    from(bucket: string): {
      createSignedUrls(
        paths: string[],
        expiresIn: number
      ): PromiseLike<{ data: unknown; error: unknown }>;
    };
  };
};

/** Las firmas por ruta. Una ruta sin firma no aparece en el mapa. */
export type SignedPaths = Map<string, string>;

export async function signMediaPaths(input: {
  bucket: string;
  paths: string[];
  signer: SupabaseLikeSigner;
  ttlSeconds: number;
}): Promise<SignedPaths> {
  const firmadas: SignedPaths = new Map();
  // Sin rutas no hay nada que firmar, y no merece la pena molestar al almacen.
  // `trim` en la comprobacion, no en el valor: una ruta de solo espacios no existe en el almacen y
  // haria fallar la firma del lote ENTERO. Se descarta, pero no se toca la ruta de las demas.
  const unicas = [...new Set(input.paths.filter((path) => path.trim().length > 0))];
  if (unicas.length === 0) return firmadas;

  const { data, error } = await input.signer.storage
    .from(input.bucket)
    .createSignedUrls(unicas, input.ttlSeconds);
  if (error || !data) {
    throw new Error('No fue posible firmar los archivos del almacen.');
  }

  for (const entrada of data as Array<{ path?: unknown; signedUrl?: unknown }>) {
    if (typeof entrada.path === 'string' && typeof entrada.signedUrl === 'string') {
      firmadas.set(entrada.path, entrada.signedUrl);
    }
  }
  return firmadas;
}
