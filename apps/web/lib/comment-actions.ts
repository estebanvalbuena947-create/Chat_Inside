import { createClient } from './supabase/server';

/**
 * Ayudante de las acciones sobre comentarios. Resuelve la sesion y el espacio, y llama a la API.
 * Se centraliza aqui para que las rutas del navegador sean finas y no repitan el token.
 */
export type CommentActionOutcome = { body: unknown; status: number };

export async function callCommentApi(input: {
  apiPath: string;
  body?: unknown;
  method: 'DELETE' | 'POST';
}): Promise<CommentActionOutcome> {
  const apiUrl = process.env.INTERNAL_API_URL;
  if (!apiUrl) {
    return { body: { error: 'La URL interna de API no esta configurada.' }, status: 500 };
  }

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const {
    data: { session }
  } = await supabase.auth.getSession();
  if (claimsError || !claimsData?.claims || !session?.access_token) {
    return { body: { error: 'Sesion no valida.' }, status: 401 };
  }

  const base = apiUrl.replace(/\/$/, '');
  const headers = { Authorization: `Bearer ${session.access_token}` };
  try {
    const tenantsResponse = await fetch(`${base}/v1/tenants`, { cache: 'no-store', headers });
    if (!tenantsResponse.ok) {
      return { body: { error: 'No fue posible resolver tu espacio.' }, status: 502 };
    }
    const tenantsPayload = (await tenantsResponse.json()) as { items: Array<{ id: string }> };
    const [tenant] = tenantsPayload.items;
    if (!tenant) return { body: { error: 'No perteneces a ningun espacio.' }, status: 403 };

    const response = await fetch(`${base}/v1/tenants/${tenant.id}${input.apiPath}`, {
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      cache: 'no-store',
      headers: { ...headers, 'Content-Type': 'application/json' },
      method: input.method
    });
    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) {
      const mensaje =
        typeof payload === 'object' && payload !== null && 'message' in payload
          ? (payload as { message?: unknown }).message
          : null;
      return {
        body: { error: typeof mensaje === 'string' ? mensaje : 'La accion no se pudo completar.' },
        status: response.status
      };
    }
    return { body: payload, status: response.status };
  } catch {
    return { body: { error: 'La API no esta disponible.' }, status: 503 };
  }
}
