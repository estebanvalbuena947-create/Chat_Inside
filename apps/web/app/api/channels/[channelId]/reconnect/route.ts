import { NextRequest, NextResponse } from 'next/server';
import { getSingleTenantApiContext } from '../../../../../lib/tenant-api-context';

/**
 * Vuelve a abrir la autorizacion del proveedor para un canal retirado.
 *
 * Devuelve la direccion a la que hay que llevar al administrador; el registro de la cuenta al volver
 * es el mismo camino de la conexion inicial.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ channelId: string }> }
): Promise<NextResponse> {
  const apiContext = await getSingleTenantApiContext();
  if ('error' in apiContext) {
    return NextResponse.json({ error: apiContext.error }, { status: apiContext.status });
  }

  const { channelId } = await context.params;
  const response = await fetch(
    `${apiContext.apiUrl}/v1/tenants/${apiContext.tenant.id}/channels/${encodeURIComponent(channelId)}/reconnect`,
    {
      cache: 'no-store',
      headers: { Authorization: apiContext.authorization },
      method: 'POST'
    }
  );

  return new NextResponse(await response.text(), {
    headers: { 'Content-Type': 'application/json' },
    status: response.status
  });
}
