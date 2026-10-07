import { NextResponse } from 'next/server';
import { getSingleTenantApiContext } from '../../../lib/tenant-api-context';

/**
 * Las sedes del espacio, para la pantalla de multimedia.
 *
 * La ruta existe para que el navegador no hable con la API directamente: resuelve el espacio, la
 * sesion y la direccion, y reenvia. Misma forma que las demas rutas de la web.
 *
 * Sin cache: la lista de sedes cambia poco, pero es corta y no lleva enlaces que caduquen, asi que
 * no hay motivo para servir algo viejo.
 */

function isContextError(
  context: Awaited<ReturnType<typeof getSingleTenantApiContext>>
): context is { error: string; status: number } {
  return 'error' in context;
}

export async function GET(): Promise<NextResponse> {
  const context = await getSingleTenantApiContext();
  if (isContextError(context)) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const response = await fetch(`${context.apiUrl}/v1/tenants/${context.tenant.id}/branches`, {
    cache: 'no-store',
    headers: { Authorization: context.authorization }
  });

  return new NextResponse(await response.text(), {
    headers: { 'Content-Type': 'application/json' },
    status: response.status
  });
}
