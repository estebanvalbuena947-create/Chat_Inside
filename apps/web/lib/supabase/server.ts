import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

function getServerSupabaseConfig(): { key: string; url: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error('La autenticación no está configurada para esta interfaz.');
  }

  return { key, url };
}

export async function createClient() {
  const cookieStore = await cookies();
  const { key, url } = getServerSupabaseConfig();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, options, value }) => cookieStore.set(name, value, options));
        } catch {
          // El middleware renueva las cookies en solicitudes renderizadas por servidor.
        }
      }
    }
  });
}
