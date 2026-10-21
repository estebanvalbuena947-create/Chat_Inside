import { NextRequest, NextResponse } from 'next/server';
import { proxyTenantRequest } from '../../../../lib/tenant-api-proxy';
export async function PUT(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const { userId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(userId))
    return NextResponse.json({ error: 'Integrante inválido.' }, { status: 400 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Horario inválido.' }, { status: 400 });
  }
  return proxyTenantRequest(`work-schedules/${encodeURIComponent(userId)}`, 'PUT', body);
}
