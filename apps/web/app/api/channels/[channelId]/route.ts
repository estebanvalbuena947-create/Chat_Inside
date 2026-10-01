import { NextRequest, NextResponse } from 'next/server';
import { getSingleTenantApiContext } from '../../../../lib/tenant-api-context';

function isContextError(
  context: Awaited<ReturnType<typeof getSingleTenantApiContext>>
): context is { error: string; status: number } {
  return 'error' in context;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ channelId: string }> }
): Promise<NextResponse> {
  const apiContext = await getSingleTenantApiContext();
  if (isContextError(apiContext)) {
    return NextResponse.json({ error: apiContext.error }, { status: apiContext.status });
  }

  const { channelId } = await context.params;
  const response = await fetch(
    `${apiContext.apiUrl}/v1/tenants/${apiContext.tenant.id}/channels/${encodeURIComponent(channelId)}`,
    {
      body: await request.text(),
      cache: 'no-store',
      headers: { Authorization: apiContext.authorization, 'Content-Type': 'application/json' },
      method: 'PATCH'
    }
  );

  return new NextResponse(await response.text(), {
    headers: { 'Content-Type': 'application/json' },
    status: response.status
  });
}
