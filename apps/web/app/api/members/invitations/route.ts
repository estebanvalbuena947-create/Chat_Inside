import { NextRequest, NextResponse } from 'next/server';
import { getSingleTenantApiContext } from '../../../../lib/tenant-api-context';

function isContextError(
  context: Awaited<ReturnType<typeof getSingleTenantApiContext>>
): context is { error: string; status: number } {
  return 'error' in context;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const context = await getSingleTenantApiContext();
  if (isContextError(context)) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const response = await fetch(`${context.apiUrl}/v1/tenants/${context.tenant.id}/invitations`, {
    body: await request.text(),
    cache: 'no-store',
    headers: { Authorization: context.authorization, 'Content-Type': 'application/json' },
    method: 'POST'
  });

  return new NextResponse(await response.text(), {
    headers: { 'Content-Type': 'application/json' },
    status: response.status
  });
}
