import { z } from 'zod';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const environmentSchema = z.enum(['local', 'test', 'staging', 'production']).default('local');

export const runtimeConfigSchema = z.object({
  APP_ENV: environmentSchema,
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  APP_PUBLIC_URL: z.url().default('http://localhost:3000')
});

export type RuntimeConfig = z.infer<typeof runtimeConfigSchema>;

export function parseRuntimeConfig(environment: Record<string, string | undefined>): RuntimeConfig {
  return runtimeConfigSchema.parse(environment);
}

export const supabaseServerEnvironmentSchema = z
  .object({
    SUPABASE_SECRET_KEY: z.string().min(1).optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    SUPABASE_URL: z.url()
  })
  .refine(
    (environment) =>
      Boolean(environment.SUPABASE_SECRET_KEY ?? environment.SUPABASE_SERVICE_ROLE_KEY),
    { message: 'Se requiere una clave secreta de Supabase para el servidor.' }
  );

export type SupabaseServerEnvironment = z.infer<typeof supabaseServerEnvironmentSchema>;
export type SupabaseServerClient = SupabaseClient;

export function createServerSupabaseClient(
  configuration: SupabaseServerEnvironment
): SupabaseClient {
  const secretKey = configuration.SUPABASE_SECRET_KEY ?? configuration.SUPABASE_SERVICE_ROLE_KEY;

  if (!secretKey) {
    throw new Error('La configuración de Supabase no contiene una clave privada.');
  }

  return createClient(configuration.SUPABASE_URL, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

/**
 * Una variable que llega vacia equivale a no estar.
 *
 * El stack de Docker pasa `SPA_SUPABASE_URL=` cuando la variable no esta en el `.env` del servidor.
 * Sin esto, ese vacio seria un valor invalido y la API no arrancaria por una integracion que quiza
 * todavia no se ha configurado.
 */
function emptyAsAbsent(value: unknown): unknown {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

/**
 * Proyecto de reservas (SPA). Es **otra** base, distinta de la nuestra, y la clave es de servicio:
 * solo la API la recibe, nunca la web.
 */
export const reservationsEnvironmentSchema = z.object({
  SPA_SUPABASE_SECRET_KEY: z.preprocess(emptyAsAbsent, z.string().min(1).optional()),
  SPA_SUPABASE_URL: z.preprocess(emptyAsAbsent, z.url().optional())
});

export type ReservationsEnvironment = z.infer<typeof reservationsEnvironmentSchema>;

export function parseReservationsEnvironment(
  environment: Record<string, string | undefined>
): ReservationsEnvironment {
  return reservationsEnvironmentSchema.parse(environment);
}

/**
 * Cliente del proyecto de reservas, o nulo si no esta configurado.
 *
 * Devolver nulo y no lanzar es deliberado: el apartado de reservas tiene que poder responder «sin
 * configurar» en lugar de impedir que la API arranque. Quien lo use decide que decir.
 */
export function createReservationsSupabaseClient(
  environment: Record<string, string | undefined>
): SupabaseClient | null {
  const configuration = parseReservationsEnvironment(environment);
  if (!configuration.SPA_SUPABASE_URL || !configuration.SPA_SUPABASE_SECRET_KEY) return null;

  return createClient(configuration.SPA_SUPABASE_URL, configuration.SPA_SUPABASE_SECRET_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
