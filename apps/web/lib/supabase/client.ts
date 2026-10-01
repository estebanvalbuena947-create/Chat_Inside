import { createBrowserClient } from '@supabase/ssr';

function getBrowserSupabaseConfig(): { key: string; url: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error('La autenticación no está configurada para esta interfaz.');
  }

  return { key, url };
}

export function createClient() {
  const { key, url } = getBrowserSupabaseConfig();
  return createBrowserClient(url, key);
}
