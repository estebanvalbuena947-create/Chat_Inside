import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

type ApiTenant = { id: string; name: string; role: 'admin' | 'supervisor' | 'agent'; slug: string };

function getApiUrl(): string {
  const url = process.env.INTERNAL_API_URL;

  if (!url) {
    throw new Error('La URL interna de API no está configurada.');
  }

  return url.replace(/\/$/, '');
}

export async function GET(request: NextRequest): Promise<NextResponse> {
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
    const headers = { Authorization: `Bearer ${session.access_token}` };
    const tenantsResponse = await fetch(`${apiUrl}/v1/tenants`, {
      cache: 'no-store',
      headers
    });

    if (!tenantsResponse.ok) {
      return NextResponse.json({ error: 'No fue posible cargar tus tenants.' }, { status: 502 });
    }

    const tenantsPayload = (await tenantsResponse.json()) as { items: ApiTenant[] };

    if (tenantsPayload.items.length === 0) {
      return NextResponse.json({ state: 'no_tenant' });
    }

    if (tenantsPayload.items.length > 1) {
      return NextResponse.json({ state: 'tenant_selection_required' });
    }

    const [tenant] = tenantsPayload.items;
    const conversationQuery = new URLSearchParams({ limit: '50' });
    const assignmentScope = request.nextUrl.searchParams.get('assignmentScope');
    if (assignmentScope === 'assigned_to_me') {
      conversationQuery.set('assignmentScope', assignmentScope);
    }
    const platform = request.nextUrl.searchParams.get('platform');
    if (platform) conversationQuery.set('platform', platform);
    const kind = request.nextUrl.searchParams.get('kind');
    if (kind === 'messages' || kind === 'comments') conversationQuery.set('kind', kind);
    const labelId = request.nextUrl.searchParams.get('labelId');
    if (labelId) conversationQuery.set('labelId', labelId);
    const cursor = request.nextUrl.searchParams.get('cursor');
    if (cursor) conversationQuery.set('cursor', cursor);
    const search = request.nextUrl.searchParams.get('search');
    if (search) conversationQuery.set('search', search);
    const conversationsResponse = await fetch(
      `${apiUrl}/v1/tenants/${tenant.id}/conversations?${conversationQuery.toString()}`,
      { cache: 'no-store', headers }
    );

    if (!conversationsResponse.ok) {
      return NextResponse.json({ error: 'No fue posible cargar la bandeja.' }, { status: 502 });
    }

    const conversationsPayload = await conversationsResponse.json();
    return NextResponse.json({
      conversations: conversationsPayload.items,
      nextCursor:
        typeof conversationsPayload.nextCursor === 'string'
          ? conversationsPayload.nextCursor
          : null,
      state: 'ready',
      tenant
    });
  } catch {
    return NextResponse.json({ error: 'La bandeja no está disponible.' }, { status: 503 });
  }
}
