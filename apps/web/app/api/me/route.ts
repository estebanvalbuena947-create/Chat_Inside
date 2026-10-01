import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

function getApiUrl(): string {
  const url = process.env.INTERNAL_API_URL;
  if (!url) throw new Error('La URL interna de API no está configurada.');
  return url.replace(/\/$/, '');
}

async function forward(request: NextRequest, method: 'GET' | 'PATCH'): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (claimsError || !claimsData?.claims || !session?.access_token) {
    return NextResponse.json({ error: 'Sesión no válida.' }, { status: 401 });
  }

  const response = await fetch(`${getApiUrl()}/v1/me`, {
    body: method === 'PATCH' ? await request.text() : undefined,
    cache: 'no-store',
    headers:
      method === 'PATCH'
        ? { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }
        : { Authorization: `Bearer ${session.access_token}` },
    method
  });

  return new NextResponse(await response.text(), {
    headers: { 'Content-Type': 'application/json' },
    status: response.status
  });
}

export function GET(request: NextRequest): Promise<NextResponse> {
  return forward(request, 'GET');
}

export function PATCH(request: NextRequest): Promise<NextResponse> {
  return forward(request, 'PATCH');
}
