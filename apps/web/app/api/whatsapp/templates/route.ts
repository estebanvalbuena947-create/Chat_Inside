import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

/**
 * Plantillas aprobadas de WhatsApp del espacio.
 *
 * El navegador no habla con la API ni con Zernio: esta ruta resuelve la sesion y el espacio, y
 * reenvia la lectura. Son de la cuenta de WhatsApp, no de una conversacion concreta.
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  const apiUrl = process.env.INTERNAL_API_URL;
  if (!apiUrl) {
    return NextResponse.json(
      { error: 'La URL interna de API no esta configurada.' },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (claimsError || !claimsData?.claims || !session?.access_token) {
    return NextResponse.json({ error: 'Sesion no valida.' }, { status: 401 });
  }

  const base = apiUrl.replace(/\/$/, '');
  const headers = { Authorization: `Bearer ${session.access_token}` };

  try {
    const tenantsResponse = await fetch(`${base}/v1/tenants`, { cache: 'no-store', headers });
    if (!tenantsResponse.ok) {
      return NextResponse.json({ error: 'No fue posible resolver tu espacio.' }, { status: 502 });
    }
    const tenantsPayload = (await tenantsResponse.json()) as { items: Array<{ id: string }> };
    const [tenant] = tenantsPayload.items;
    if (!tenant) {
      return NextResponse.json({ error: 'No perteneces a ningun espacio.' }, { status: 403 });
    }

    const response = await fetch(`${base}/v1/tenants/${tenant.id}/channels/whatsapp/templates`, {
      cache: 'no-store',
      headers
    });
    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) {
      return NextResponse.json(
        { error: 'No fue posible leer las plantillas de WhatsApp.' },
        { status: response.status }
      );
    }
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: 'La API no esta disponible.' }, { status: 503 });
  }
}
