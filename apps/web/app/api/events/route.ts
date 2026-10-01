import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

type ApiTenant = { id: string };

function getApiUrl(): string {
  const url = process.env.INTERNAL_API_URL;
  if (!url) throw new Error('La URL interna de API no está configurada.');
  return url.replace(/\/$/, '');
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<Response> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (claimsError || !claimsData?.claims || !session?.access_token) {
    return NextResponse.json({ error: 'Sesión no válida.' }, { status: 401 });
  }

  try {
    const apiUrl = getApiUrl();
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      Authorization: `Bearer ${session.access_token}`
    };
    const lastEventId = request.headers.get('last-event-id');
    if (lastEventId) headers['Last-Event-ID'] = lastEventId;

    const tenantsResponse = await fetch(`${apiUrl}/v1/tenants`, {
      cache: 'no-store',
      headers: { Authorization: headers.Authorization }
    });
    if (!tenantsResponse.ok) {
      return NextResponse.json({ error: 'No fue posible validar el tenant.' }, { status: 502 });
    }
    const tenantsPayload = (await tenantsResponse.json()) as { items: ApiTenant[] };
    if (tenantsPayload.items.length !== 1) {
      return NextResponse.json(
        { error: 'Debes seleccionar un tenant antes de recibir eventos.' },
        { status: 409 }
      );
    }

    const response = await fetch(`${apiUrl}/v1/tenants/${tenantsPayload.items[0].id}/events`, {
      cache: 'no-store',
      headers
    });
    if (!response.ok || !response.body) {
      return new NextResponse(await response.text(), {
        headers: { 'Content-Type': 'application/json' },
        status: response.status || 502
      });
    }
    return new Response(response.body, {
      headers: {
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream; charset=utf-8'
      },
      status: response.status
    });
  } catch {
    return NextResponse.json(
      { error: 'Los eventos en tiempo real no están disponibles.' },
      { status: 503 }
    );
  }
}
