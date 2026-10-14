import { NextRequest, NextResponse } from 'next/server';
import { getSingleTenantApiContext } from '../../../../../lib/tenant-api-context';

/**
 * Corregir o quitar un archivo del material de una sede.
 *
 * El titulo es la clave por la que el bot pide el material, asi que poder corregirlo sin volver a
 * subir el archivo es parte de administrar la multimedia, no un extra.
 *
 * Un fallo se reenvia con el motivo de la API tal cual: «ese archivo no esta en el material de esta
 * sede» es lo que hay que leer, no un error generico.
 */

async function reenviar(respuesta: Response): Promise<NextResponse> {
  const texto = await respuesta.text();
  return new NextResponse(texto, {
    headers: { 'Content-Type': 'application/json' },
    status: respuesta.status
  });
}

export async function PATCH(
  request: NextRequest,
  contexto: { params: Promise<{ mediaId: string }> }
): Promise<NextResponse> {
  const context = await getSingleTenantApiContext();
  if ('error' in context)
    return NextResponse.json({ error: context.error }, { status: context.status });

  // La sede viaja como parametro de la direccion: la pantalla ya sabe en cual esta trabajando, y la
  // API la comprueba contra el archivo antes de escribir nada.
  const branchSlug = request.nextUrl.searchParams.get('branchSlug') ?? '';
  if (!branchSlug.trim()) {
    return NextResponse.json({ error: 'Hace falta la sede.' }, { status: 422 });
  }

  const { mediaId } = await contexto.params;
  const cuerpo = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const parche: Record<string, unknown> = {};
  if (cuerpo.title !== undefined) parche.title = cuerpo.title;
  if (cuerpo.sortOrder !== undefined) parche.sortOrder = cuerpo.sortOrder;

  const respuesta = await fetch(
    `${context.apiUrl}/v1/tenants/${context.tenant.id}/branches/${encodeURIComponent(
      branchSlug
    )}/media/${encodeURIComponent(mediaId)}`,
    {
      body: JSON.stringify(parche),
      headers: { Authorization: context.authorization, 'Content-Type': 'application/json' },
      method: 'PATCH'
    }
  );
  return reenviar(respuesta);
}

export async function DELETE(
  request: NextRequest,
  contexto: { params: Promise<{ mediaId: string }> }
): Promise<NextResponse> {
  const context = await getSingleTenantApiContext();
  if ('error' in context)
    return NextResponse.json({ error: context.error }, { status: context.status });

  const branchSlug = request.nextUrl.searchParams.get('branchSlug') ?? '';
  if (!branchSlug.trim()) {
    return NextResponse.json({ error: 'Hace falta la sede.' }, { status: 422 });
  }

  const { mediaId } = await contexto.params;
  const respuesta = await fetch(
    `${context.apiUrl}/v1/tenants/${context.tenant.id}/branches/${encodeURIComponent(
      branchSlug
    )}/media/${encodeURIComponent(mediaId)}`,
    { headers: { Authorization: context.authorization }, method: 'DELETE' }
  );
  return reenviar(respuesta);
}
