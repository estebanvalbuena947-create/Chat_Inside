import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../../../lib/supabase/server';

/** El navegador nunca obtiene la credencial de la API ni de la base de reservas. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ draftId: string }> }
): Promise<NextResponse> {
  const apiUrl = process.env.INTERNAL_API_URL;
  const { draftId } = await context.params;
  if (!apiUrl)
    return NextResponse.json(
      { error: 'La URL interna de API no esta configurada.' },
      { status: 500 }
    );
  if (!/^\d+$/.test(draftId))
    return NextResponse.json({ error: 'La pre-reserva no es válida.' }, { status: 400 });

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (claimsError || !claimsData?.claims || !session?.access_token) {
    return NextResponse.json({ error: 'Sesion no valida.' }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'La decisión no es válida.' }, { status: 400 });
  const headers = {
    Authorization: `Bearer ${session.access_token}`,
    'Content-Type': 'application/json'
  };
  const base = apiUrl.replace(/\/$/, '');
  try {
    const tenants = await fetch(`${base}/v1/tenants`, { cache: 'no-store', headers });
    const tenantsPayload = (await tenants.json().catch(() => ({}))) as {
      items?: Array<{ id: string }>;
    };
    const tenant = tenantsPayload.items?.[0];
    if (!tenants.ok || !tenant)
      return NextResponse.json({ error: 'No fue posible resolver tu espacio.' }, { status: 403 });
    const response = await fetch(
      `${base}/v1/tenants/${tenant.id}/reservations/drafts/${draftId}/decision`,
      {
        body: JSON.stringify(body),
        headers,
        method: 'POST'
      }
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = (payload as { message?: unknown }).message;
      return NextResponse.json(
        { error: typeof message === 'string' ? message : 'No fue posible guardar la decisión.' },
        { status: response.status }
      );
    }
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: 'La API no esta disponible.' }, { status: 503 });
  }
}
