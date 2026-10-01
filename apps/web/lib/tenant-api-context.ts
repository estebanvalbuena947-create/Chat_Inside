import { createClient } from './supabase/server';

export type ApiTenant = {
  id: string;
  name: string;
  role: 'admin' | 'supervisor' | 'agent';
  slug: string;
};

export type TenantApiContext = {
  apiUrl: string;
  authorization: string;
  tenant: ApiTenant;
};

export type TenantApiContextError = { error: string; status: number };

function getApiUrl(): string {
  const url = process.env.INTERNAL_API_URL;
  if (!url) throw new Error('La URL interna de API no está configurada.');
  return url.replace(/\/$/, '');
}

export async function getSingleTenantApiContext(): Promise<
  TenantApiContext | TenantApiContextError
> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (claimsError || !claimsData?.claims || !session?.access_token) {
    return { error: 'Sesión no válida.', status: 401 };
  }

  try {
    const apiUrl = getApiUrl();
    const authorization = `Bearer ${session.access_token}`;
    const tenantsResponse = await fetch(`${apiUrl}/v1/tenants`, {
      cache: 'no-store',
      headers: { Authorization: authorization }
    });
    if (!tenantsResponse.ok) {
      return { error: 'No fue posible cargar tus tenants.', status: 502 };
    }
    const payload = (await tenantsResponse.json()) as { items?: ApiTenant[] };
    if (!Array.isArray(payload.items) || payload.items.length !== 1) {
      return { error: 'No hay un tenant único seleccionado para esta acción.', status: 409 };
    }
    return { apiUrl, authorization, tenant: payload.items[0] };
  } catch {
    return { error: 'La API no está disponible.', status: 503 };
  }
}
