import { NextRequest, NextResponse } from 'next/server';
import { getSingleTenantApiContext } from '../../../../../../lib/tenant-api-context';

type RouteContext = { params: Promise<{ conversationId: string; labelId: string }> };

function isContextError(
  context: Awaited<ReturnType<typeof getSingleTenantApiContext>>
): context is { error: string; status: number } {
  return 'error' in context;
}

async function proxyMutation(
  context: RouteContext,
  method: 'PUT' | 'DELETE'
): Promise<NextResponse> {
  const tenantContext = await getSingleTenantApiContext();
  if (isContextError(tenantContext)) {
    return NextResponse.json({ error: tenantContext.error }, { status: tenantContext.status });
  }
  const { conversationId, labelId } = await context.params;
  const response = await fetch(
    `${tenantContext.apiUrl}/v1/tenants/${tenantContext.tenant.id}/conversations/${encodeURIComponent(conversationId)}/labels/${encodeURIComponent(labelId)}`,
    {
      cache: 'no-store',
      headers: { Authorization: tenantContext.authorization },
      method
    }
  );
  const payload = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : {};
  return NextResponse.json(payload, { status: response.status });
}

export function PUT(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return proxyMutation(context, 'PUT');
}

export function DELETE(_request: NextRequest, context: RouteContext): Promise<NextResponse> {
  return proxyMutation(context, 'DELETE');
}
