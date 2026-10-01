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
