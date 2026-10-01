import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createServerSupabaseClient, supabaseServerEnvironmentSchema } from '@chat-zernio/config';
import type { SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseServerClientFactory {
  isConfigured(environment: Record<string, string | undefined> = process.env): boolean {
    return supabaseServerEnvironmentSchema.safeParse(environment).success;
  }

  create(environment: Record<string, string | undefined> = process.env): SupabaseClient {
    const configuration = supabaseServerEnvironmentSchema.safeParse(environment);

    if (!configuration.success) {
      throw new ServiceUnavailableException(
        'La conexión segura a datos aún no está configurada en este entorno.'
      );
    }

    return createServerSupabaseClient(configuration.data);
  }
}
