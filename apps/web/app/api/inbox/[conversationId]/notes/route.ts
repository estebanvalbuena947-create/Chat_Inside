import { NextRequest, NextResponse } from 'next/server';
import { getSingleTenantApiContext } from '../../../../../lib/tenant-api-context';

function isContextError(
  context: Awaited<ReturnType<typeof getSingleTenantApiContext>>
): context is { error: string; status: number } {
  return 'error' in context;
}

async function forward(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> },
  method: 'GET' | 'POST'
): Promise<NextResponse> {
  const apiContext = await getSingleTenantApiContext();
  if (isContextError(apiContext)) {
    return NextResponse.json({ error: apiContext.error }, { status: apiContext.status });
  }
  const { conversationId } = await context.params;
  const response = await fetch(
    `${apiContext.apiUrl}/v1/tenants/${apiContext.tenant.id}/conversations/${encodeURIComponent(conversationId)}/notes`,
    {
      body: method === 'POST' ? await request.text() : undefined,
      cache: 'no-store',
      headers:
        method === 'POST'
          ? { Authorization: apiContext.authorization, 'Content-Type': 'application/json' }
          : { Authorization: apiContext.authorization },
      method
    }
  );
  return new NextResponse(await response.text(), {
    headers: { 'Content-Type': 'application/json' },
    status: response.status
  });
}

export function GET(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
): Promise<NextResponse> {
  return forward(request, context, 'GET');
}

export function POST(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
): Promise<NextResponse> {
  return forward(request, context, 'POST');
}
