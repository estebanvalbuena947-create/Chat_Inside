import { proxyTenantRequest } from '../../../lib/tenant-api-proxy';
export async function GET() {
  return proxyTenantRequest('work-schedules');
}
