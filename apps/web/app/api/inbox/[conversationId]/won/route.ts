import { NextRequest, NextResponse } from 'next/server';
import { getSingleTenantApiContext } from '../../../../../lib/tenant-api-context';

type RouteContext = { params: Promise<{ conversationId: string }> };

function isContextError(
  context: Awaited<ReturnType<typeof getSingleTenantApiContext>>
): context is { error: string; status: number } {
  return 'error' in context;
}

/** Marca la conversacion como ganada con su valor total. El navegador no habla con la API directo. */
export async function POST(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const tenantContext = await getSingleTenantApiContext();
  if (isContextError(tenantContext)) {
    return NextResponse.json({ error: tenantContext.error }, { status: tenantContext.status });
  }
  const { conversationId } = await context.params;
  try {
    const response = await fetch(
      `${tenantContext.apiUrl}/v1/tenants/${tenantContext.tenant.id}/conversations/${encodeURIComponent(conversationId)}/won`,
      {
        body: JSON.stringify(await request.json().catch(() => ({}))),
        cache: 'no-store',
        headers: {
          Authorization: tenantContext.authorization,
          'Content-Type': 'application/json'
        },
        method: 'POST'
      }
    );
    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) {
      const mensaje =
        typeof payload === 'object' && payload !== null && 'message' in payload
          ? (payload as { message?: unknown }).message
          : null;
      return NextResponse.json(
        { error: typeof mensaje === 'string' ? mensaje : 'No fue posible marcarla como ganada.' },
        { status: response.status }
      );
    }
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: 'La API no esta disponible.' }, { status: 503 });
  }
}
