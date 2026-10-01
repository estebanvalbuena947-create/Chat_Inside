import { NextRequest, NextResponse } from 'next/server';
import { getSingleTenantApiContext } from '../../../../lib/tenant-api-context';

type RouteContext = { params: Promise<{ responseId: string }> };

function isContextError(
  context: Awaited<ReturnType<typeof getSingleTenantApiContext>>
): context is { error: string; status: number } {
  return 'error' in context;
}

async function proxyMutation(
  request: NextRequest,
  context: RouteContext,
  method: 'PATCH' | 'DELETE'
) {
  const tenantContext = await getSingleTenantApiContext();
  if (isContextError(tenantContext)) {
    return NextResponse.json({ error: tenantContext.error }, { status: tenantContext.status });
  }
  const body = await request.json().catch(() => null);
  if (!body)
    return NextResponse.json({ error: 'La respuesta rápida no es válida.' }, { status: 400 });
  const { responseId } = await context.params;
  const response = await fetch(
    `${tenantContext.apiUrl}/v1/tenants/${tenantContext.tenant.id}/canned-responses/${responseId}`,
    {
      body: JSON.stringify(body),
      cache: 'no-store',
      headers: { Authorization: tenantContext.authorization, 'Content-Type': 'application/json' },
      method
    }
  );
  const payload = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : {};
  return NextResponse.json(payload, { status: response.status });
}

export function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return proxyMutation(request, context, 'PATCH');
}

export function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return proxyMutation(request, context, 'DELETE');
}
