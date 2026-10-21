import { NextRequest } from 'next/server';
import { proxyTenantRequest } from '../../../../lib/tenant-api-proxy';
export async function GET(request: NextRequest) {
  const query = new URLSearchParams();
  for (const key of ['days', 'date', 'bucket', 'page', 'asOf']) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) query.set(key, value);
  }
  return proxyTenantRequest(`metrics/responses?${query}`);
}
