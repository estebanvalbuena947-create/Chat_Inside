import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

/**
 * Tablero de reservas para el apartado.
 *
 * El navegador no habla con la API ni con el proyecto de reservas: esta ruta resuelve la sesion y el
 * espacio, y reenvia la lectura. La API es la que decide si el rol alcanza, no esta ruta.
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

    const response = await fetch(`${base}/v1/tenants/${tenant.id}/reservations/board`, {
      cache: 'no-store',
      headers
    });
    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) {
      // Se reenvia el motivo tal como lo dio la API: «sin configurar», «el rol no alcanza» o el fallo
      // concreto. Taparlo con un mensaje generico obliga a adivinar.
      const mensaje = (payload as { message?: unknown } | null)?.message;
      return NextResponse.json(
        {
          error:
            typeof mensaje === 'string' && mensaje.trim()
              ? mensaje
              : 'No fue posible leer el tablero de reservas.'
        },
        { status: response.status }
      );
    }
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: 'La API no esta disponible.' }, { status: 503 });
  }
}
