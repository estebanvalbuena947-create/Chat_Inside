import { NextRequest, NextResponse } from 'next/server';
import { getSingleTenantApiContext } from '../../../../../lib/tenant-api-context';

/**
 * Publica la respuesta de una persona a una resena de Google.
 *
 * El motivo de un rechazo se reenvia tal cual: «ya tiene respuesta» o «Google rechazo el texto» son
 * cosas que quien escribe tiene que leer, no un error generico.
 */
export async function POST(
  request: NextRequest,
  contexto: { params: Promise<{ reviewId: string }> }
): Promise<NextResponse> {
  const context = await getSingleTenantApiContext();
  if ('error' in context)
    return NextResponse.json({ error: context.error }, { status: context.status });

  const { reviewId } = await contexto.params;
  const cuerpo = (await request.json().catch(() => ({}))) as { comment?: unknown };

  try {
    const response = await fetch(
      `${context.apiUrl}/v1/tenants/${context.tenant.id}/reviews/${encodeURIComponent(reviewId)}/reply`,
      {
        body: JSON.stringify({ comment: typeof cuerpo.comment === 'string' ? cuerpo.comment : '' }),
        headers: { Authorization: context.authorization, 'Content-Type': 'application/json' },
        method: 'POST'
      }
    );
    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) {
      const mensaje = (payload as { message?: unknown } | null)?.message;
      return NextResponse.json(
        {
          error:
            typeof mensaje === 'string' && mensaje.trim()
              ? mensaje
              : 'No fue posible publicar la respuesta.'
        },
        { status: response.status }
      );
    }
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: 'La API no está disponible.' }, { status: 503 });
  }
}
