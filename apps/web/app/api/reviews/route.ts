import { NextResponse } from 'next/server';
import { getSingleTenantApiContext } from '../../../lib/tenant-api-context';

/**
 * Resenas de Google que esperan respuesta.
 *
 * La sesion y el espacio se resuelven aqui; la API decide si la persona alcanza. El navegador nunca
 * habla con la API ni con Zernio.
 */
export async function GET(): Promise<NextResponse> {
  const context = await getSingleTenantApiContext();
  if ('error' in context)
    return NextResponse.json({ error: context.error }, { status: context.status });

  try {
    const response = await fetch(`${context.apiUrl}/v1/tenants/${context.tenant.id}/reviews`, {
      cache: 'no-store',
      headers: { Authorization: context.authorization }
    });
    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) {
      const mensaje = (payload as { message?: unknown } | null)?.message;
      return NextResponse.json(
        {
          error:
            typeof mensaje === 'string' && mensaje.trim()
              ? mensaje
              : 'No fue posible leer las reseñas.'
        },
        { status: response.status }
      );
    }
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: 'La API no está disponible.' }, { status: 503 });
  }
}
