import { NextRequest, NextResponse } from 'next/server';
import { getSingleTenantApiContext } from '../../../../lib/tenant-api-context';

/**
 * Multimedia de una sede, para la pantalla de configuracion.
 *
 * La ruta existe para que el navegador no hable con la API directamente: resuelve el espacio, la
 * sesion y la direccion, y reenvia. Es la misma forma que usan las demas rutas de la web.
 *
 * El listado lleva enlaces firmados que caducan y se firman de nuevo en cada llamada, asi que la
 * respuesta se cachea cinco minutos, igual que la multimedia de las conversaciones: sin eso el
 * navegador ve una direccion distinta cada vez y vuelve a descargar cada imagen.
 */

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

  const branchSlug = request.nextUrl.searchParams.get('branchSlug') ?? '';
  if (!branchSlug.trim()) {
    return NextResponse.json({ error: 'Hace falta la sede.' }, { status: 422 });
  }

  const response = await fetch(
    `${context.apiUrl}/v1/tenants/${context.tenant.id}/branches/${encodeURIComponent(
      branchSlug
    )}/media`,
    { cache: 'no-store', headers: { Authorization: context.authorization } }
  );

  return new NextResponse(await response.text(), {
    headers: {
      'Cache-Control': 'private, max-age=300',
      'Content-Type': 'application/json'
    },
    status: response.status
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const context = await getSingleTenantApiContext();
  if (isContextError(context)) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const cuerpo = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const branchSlug = typeof cuerpo.branchSlug === 'string' ? cuerpo.branchSlug.trim() : '';
  if (!branchSlug) {
    return NextResponse.json({ error: 'Hace falta la sede.' }, { status: 422 });
  }

  const response = await fetch(
    `${context.apiUrl}/v1/tenants/${context.tenant.id}/branches/${encodeURIComponent(
      branchSlug
    )}/media`,
    {
      body: JSON.stringify({
        sortOrder: cuerpo.sortOrder,
        sourceUrl: cuerpo.sourceUrl,
        title: cuerpo.title
      }),
      headers: {
        Authorization: context.authorization,
        'Content-Type': 'application/json'
      },
      method: 'POST'
    }
  );

  // Sin cache: es una escritura, y la respuesta solo interesa a quien la pidio.
  return new NextResponse(await response.text(), {
    headers: { 'Content-Type': 'application/json' },
    status: response.status
  });
}
