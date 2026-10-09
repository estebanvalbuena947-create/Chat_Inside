import { NextResponse } from 'next/server';
import { getSingleTenantApiContext } from '../../../lib/tenant-api-context';

export async function POST(): Promise<NextResponse> {
  const context = await getSingleTenantApiContext();
  if ('error' in context)
    return NextResponse.json({ error: context.error }, { status: context.status });

  try {
    const response = await fetch(`${context.apiUrl}/v1/tenants/${context.tenant.id}/presence`, {
      headers: { Authorization: context.authorization },
      method: 'POST'
    });
    if (!response.ok)
      return NextResponse.json(
        { error: 'No fue posible actualizar tu presencia.' },
        { status: 502 }
      );
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ error: 'La presencia no está disponible.' }, { status: 503 });
  }
}
