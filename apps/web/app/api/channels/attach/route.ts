import { NextRequest, NextResponse } from 'next/server';
import { getSingleTenantApiContext } from '../../../../lib/tenant-api-context';

function isContextError(
  context: Awaited<ReturnType<typeof getSingleTenantApiContext>>
): context is { error: string; status: number } {
  return 'error' in context;
}

async function readJson(response: Response): Promise<unknown> {
  return response.headers.get('content-type')?.includes('application/json') ? response.json() : {};
}

/**
 * Registra una cuenta que el proveedor ya conecto, al volver de la autorizacion.
 *
 * La verificacion vive en la API: aqui solo se reenvia el identificador con la sesion del
 * usuario, porque la cuenta debe pertenecer al perfil del espacio antes de registrarse.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const context = await getSingleTenantApiContext();
  if (isContextError(context)) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }
  const response = await fetch(
    `${context.apiUrl}/v1/tenants/${context.tenant.id}/channels/attach`,
    {
      body: await request.text(),
      cache: 'no-store',
      headers: {
        Authorization: context.authorization,
        'Content-Type': request.headers.get('content-type') ?? 'application/json'
      },
      method: 'POST'
    }
  );
  return NextResponse.json(await readJson(response), { status: response.status });
}
