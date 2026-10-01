import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';

type ApiTenant = { id: string };

function getApiUrl(): string {
  const url = process.env.INTERNAL_API_URL;
  if (!url) throw new Error('La URL interna de API no está configurada.');
  return url.replace(/\/$/, '');
}

async function getAuthorizedTarget(): Promise<
  { apiUrl: string; headers: Record<string, string>; tenant: ApiTenant } | NextResponse
> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (claimsError || !claimsData?.claims || !session?.access_token) {
    return NextResponse.json({ error: 'Sesión no válida.' }, { status: 401 });
  }
  const apiUrl = getApiUrl();
  const headers = { Authorization: `Bearer ${session.access_token}` };
  const tenantsResponse = await fetch(`${apiUrl}/v1/tenants`, { cache: 'no-store', headers });
  if (!tenantsResponse.ok)
    return NextResponse.json({ error: 'No fue posible cargar tus tenants.' }, { status: 502 });
  const tenantsPayload = (await tenantsResponse.json()) as { items: ApiTenant[] };
  if (tenantsPayload.items.length !== 1) {
    return NextResponse.json(
      { error: 'Debes seleccionar un tenant antes de operar mensajes.' },
      { status: 409 }
    );
  }
  return { apiUrl, headers, tenant: tenantsPayload.items[0] };
}

function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
): Promise<NextResponse> {
  try {
    const target = await getAuthorizedTarget();
    if (isResponse(target)) return target;
    const { conversationId } = await context.params;
    const response = await fetch(
      `${target.apiUrl}/v1/tenants/${target.tenant.id}/conversations/${encodeURIComponent(conversationId)}/messages?limit=100`,
      { cache: 'no-store', headers: target.headers }
    );
    const body = await response.text();
    return new NextResponse(body, {
      headers: { 'Content-Type': 'application/json' },
      status: response.status
    });
  } catch {
    return NextResponse.json({ error: 'El historial no está disponible.' }, { status: 503 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
): Promise<NextResponse> {
  try {
    const target = await getAuthorizedTarget();
    if (isResponse(target)) return target;
    const { conversationId } = await context.params;
    const body = await request.text();
    const response = await fetch(
      `${target.apiUrl}/v1/tenants/${target.tenant.id}/conversations/${encodeURIComponent(conversationId)}/messages`,
      { body, headers: { ...target.headers, 'Content-Type': 'application/json' }, method: 'POST' }
    );
    const responseBody = await response.text();
    return new NextResponse(responseBody, {
      headers: { 'Content-Type': 'application/json' },
      status: response.status
    });
  } catch {
    return NextResponse.json({ error: 'No fue posible preparar el envío.' }, { status: 503 });
  }
}
