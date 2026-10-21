import { NextResponse } from 'next/server';
import { getSingleTenantApiContext } from './tenant-api-context';

/** Only server-owned paths are accepted; credentials never leave this process. */
export async function proxyTenantRequest(
  path: string,
  method = 'GET',
  body?: unknown
): Promise<NextResponse> {
  try {
    const context = await getSingleTenantApiContext();
    if ('error' in context)
      return NextResponse.json({ error: context.error }, { status: context.status });
    const response = await fetch(`${context.apiUrl}/v1/tenants/${context.tenant.id}/${path}`, {
      method,
      cache: 'no-store',
      headers: { Authorization: context.authorization, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const payload = await response.json().catch(() => ({}));
    return NextResponse.json(
      response.ok
        ? payload
        : {
            error:
              typeof payload.message === 'string'
                ? payload.message
                : 'No fue posible completar la solicitud.'
          },
      { status: response.status }
    );
  } catch {
    return NextResponse.json({ error: 'La API no está disponible.' }, { status: 503 });
  }
}
