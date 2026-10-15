import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();

  if (data?.claims) {
    await supabase.auth.signOut();
  }

  // request.url puede resolver a localhost detras del proxy: la web usa su dominio publico y, si no
  // esta configurado, el origen de la propia peticion. Asi el cierre de sesion siempre vuelve al
  // acceso de este mismo sitio, nunca a un host interno.
  const base = (process.env.APP_PUBLIC_URL ?? request.nextUrl.origin).replace(/\/$/, '');
  return NextResponse.redirect(new URL('/login', base), { status: 302 });
}
