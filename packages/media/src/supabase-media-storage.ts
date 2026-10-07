import type { MediaStorage } from './store-remote-media';

/**
 * El almacen de Supabase, visto solo por lo que esta pieza necesita.
 *
 * Es un tipo **estructural** a proposito: describe la forma minima de `storage.from(bucket).upload(...)`
 * sin depender de `@supabase/supabase-js`. Asi el paquete sigue sin dependencias y las pruebas pueden
 * pasar un doble con esa misma forma.
 */
export type SupabaseLikeStorage = {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        bytes: Buffer,
        options: { contentType: string; upsert: boolean }
      ): PromiseLike<{ error: unknown }>;
    };
  };
};

/**
 * Envuelve un cliente de Supabase para que `storeRemoteMedia` pueda subir con el.
 *
 * Los tres consumidores --los adjuntos de las conversaciones, los avatares de los contactos y la
 * multimedia de las sedes-- tenian cada uno sus ocho lineas de adaptador, identicas salvo por el
 * bucket, que ahora se decide en cada llamada. Esto las sustituye por una.
 *
 * Devuelve `false` en vez de lanzar cuando el almacen falla: la pieza de arriba ya trata un `false`
 * como «no se pudo guardar» y devuelve `null`, que es la regla de todo el camino.
 */
export function supabaseMediaStorage(supabase: SupabaseLikeStorage): MediaStorage {
  return {
    upload: async ({ bucket, bytes, contentType, path }) => {
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, bytes, { contentType, upsert: true });
      return !error;
    }
  };
}
