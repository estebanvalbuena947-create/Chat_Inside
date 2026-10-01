import { NextRequest, NextResponse } from 'next/server';
import { getSingleTenantApiContext } from '../../../lib/tenant-api-context';

function isContextError(
  context: Awaited<ReturnType<typeof getSingleTenantApiContext>>
): context is { error: string; status: number } {
  return 'error' in context;
}

async function readJson(response: Response): Promise<unknown> {
  return response.headers.get('content-type')?.includes('application/json') ? response.json() : {};
}

export async function GET(): Promise<NextResponse> {
  const context = await getSingleTenantApiContext();
  if (isContextError(context))
    return NextResponse.json({ error: context.error }, { status: context.status });

  const response = await fetch(
    `${context.apiUrl}/v1/tenants/${context.tenant.id}/canned-responses`,
    { cache: 'no-store', headers: { Authorization: context.authorization } }
  );
  return NextResponse.json(await readJson(response), { status: response.status });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const context = await getSingleTenantApiContext();
  if (isContextError(context))
    return NextResponse.json({ error: context.error }, { status: context.status });
  const body = await request.json().catch(() => null);
  if (!body)
    return NextResponse.json({ error: 'La respuesta rápida no es válida.' }, { status: 400 });

  const response = await fetch(
    `${context.apiUrl}/v1/tenants/${context.tenant.id}/canned-responses`,
    {
      body: JSON.stringify(body),
      cache: 'no-store',
      headers: { Authorization: context.authorization, 'Content-Type': 'application/json' },
      method: 'POST'
    }
  );
  return NextResponse.json(await readJson(response), { status: response.status });
}
