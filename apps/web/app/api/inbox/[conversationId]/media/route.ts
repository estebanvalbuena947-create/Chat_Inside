import { NextRequest, NextResponse } from 'next/server';
import { MAX_ATTACHMENT_BYTES } from '../../../../../lib/outbound-attachment';
import { getSingleTenantApiContext } from '../../../../../lib/tenant-api-context';

/**
 * Subida del archivo que una asesora va a enviar en esta conversación.
 *
 * La ruta existe para que el navegador no hable ni con la API ni con el almacén: resuelve el espacio
 * y la sesión, y reenvía el archivo. El tipo no lo decide el nombre ni el MIME que declara el
 * navegador: lo reconoce la API por los bytes.
 */

function isContextError(
  context: Awaited<ReturnType<typeof getSingleTenantApiContext>>
): context is { error: string; status: number } {
  return 'error' in context;
}

export async function POST(
  request: NextRequest,
  routeContext: { params: Promise<{ conversationId: string }> }
): Promise<NextResponse> {
  const context = await getSingleTenantApiContext();
  if (isContextError(context)) {
    return NextResponse.json({ error: context.error }, { status: context.status });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Hace falta un archivo.' }, { status: 422 });
  }
  // El límite se comprueba aquí también: es la frontera que habla con el navegador y no tiene
  // sentido mover 25 MB por la red interna para que la API los rechace al final.
  if (file.size === 0) {
    return NextResponse.json({ error: 'El archivo está vacío.' }, { status: 422 });
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ error: 'El archivo supera el límite de 25 MB.' }, { status: 422 });
  }

  const { conversationId } = await routeContext.params;
  const upstreamForm = new FormData();
  upstreamForm.set('file', file, file.name);

  try {
    const response = await fetch(
      `${context.apiUrl}/v1/tenants/${context.tenant.id}/conversations/${encodeURIComponent(
        conversationId
      )}/media`,
      { body: upstreamForm, headers: { Authorization: context.authorization }, method: 'POST' }
    );
    return new NextResponse(await response.text(), {
      headers: { 'Content-Type': 'application/json' },
      status: response.status
    });
  } catch {
    return NextResponse.json({ error: 'No fue posible subir el archivo.' }, { status: 503 });
  }
}
