import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Convierte el codigo de un enlace de Auth en una sesion de cookies del servidor antes de
 * mostrar la pantalla que crea la contrasena. Sin este canje, la pagina recibe un codigo pero
 * `updateUser` no tiene sesion y parece, erradamente, que la invitacion caduco.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.redirect(new URL('/auth/password', request.url));
  const code = request.nextUrl.searchParams.get('code');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!code || !url || !key) {
    return NextResponse.redirect(new URL('/login?error=invite', request.url));
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, options, value }) =>
          response.cookies.set(name, value, options)
        );
      }
    }
  });
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  return error ? NextResponse.redirect(new URL('/login?error=invite', request.url)) : response;
}
