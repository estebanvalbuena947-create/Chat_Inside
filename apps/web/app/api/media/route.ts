import { NextRequest, NextResponse } from 'next/server';
import { getSingleTenantApiContext } from '../../../lib/tenant-api-context';

function isContextError(
  context: Awaited<ReturnType<typeof getSingleTenantApiContext>>
): context is { error: string; status: number } {
  return 'error' in context;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const context = await getSingleTenantApiContext();
  if (isContextError(context)) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const query = request.nextUrl.searchParams.toString();
  const response = await fetch(
    `${context.apiUrl}/v1/tenants/${context.tenant.id}/media${query ? `?${query}` : ''}`,
    { cache: 'no-store', headers: { Authorization: context.authorization } }
  );

  // Esta respuesta lleva una URL firmada, y Supabase firma de nuevo en cada llamada: la URL cambia
  // aunque el archivo sea el mismo. Sin cachear, el navegador la ve como un archivo distinto y
  // vuelve a descargar la imagen entera cada pocos segundos.
  //
  // Con esto, durante cinco minutos todos los que miren la misma conversacion reciben la misma
  // direccion, y el navegador reutiliza lo que ya tiene. Se sigue refrescando sola: la firma dura
  // una hora, asi que a los cinco minutos se pide una nueva sin que nadie lo note.
  return new NextResponse(await response.text(), {
    headers: {
      'Cache-Control': 'private, max-age=300',
      'Content-Type': 'application/json'
    },
    status: response.status
  });
}
