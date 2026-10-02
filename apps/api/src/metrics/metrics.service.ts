import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { metricsSummarySchema, type MetricsSummary } from '@chat-zernio/contracts';
import { RequestAuthenticator } from '../auth/request-authenticator';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantAccessService } from '../tenants/tenant-access.service';

/** Tope de lectura. Si se alcanza, el resultado se marca como minimo en lugar de mentir. */
const MAX_ROWS = 20000;

export type MetricRow = {
  createdAt: string;
  direction: string;
  platform: string | null;
};

/**
 * Agrega los mensajes por dia y por plataforma.
 *
 * Es una funcion pura a proposito: la regla de conteo se prueba sin base de datos ni red, y el
 * servicio solo se ocupa de traer las filas y de los permisos.
 */
export function summarizeMessages(
  rows: MetricRow[],
  options: { closedConversations: number; days: number; truncated: boolean }
): MetricsSummary {
  const porDia = new Map<string, { received: number; sent: number }>();
  const porCanal = new Map<string, { received: number; sent: number }>();

  for (const fila of rows) {
    const dia = fila.createdAt.slice(0, 10);
    const esEntrante = fila.direction === 'inbound';
    const plataforma = fila.platform ?? 'sin canal';

    const acumuladoDia = porDia.get(dia) ?? { received: 0, sent: 0 };
    if (esEntrante) acumuladoDia.received += 1;
    else acumuladoDia.sent += 1;
    porDia.set(dia, acumuladoDia);

    const acumuladoCanal = porCanal.get(plataforma) ?? { received: 0, sent: 0 };
    if (esEntrante) acumuladoCanal.received += 1;
    else acumuladoCanal.sent += 1;
    porCanal.set(plataforma, acumuladoCanal);
  }

  return metricsSummarySchema.parse({
    closedConversations: options.closedConversations,
    messagesByChannel: [...porCanal.entries()]
      .map(([platform, conteo]) => ({ platform, ...conteo }))
      .sort((a, b) => b.received + b.sent - (a.received + a.sent)),
    messagesPerDay: [...porDia.entries()]
      .map(([date, conteo]) => ({ date, ...conteo }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    periodDays: options.days,
    totalMessages: rows.length,
    truncated: options.truncated
  });
}

/** Resumen de actividad de los ultimos dias. Solo lectura. */
@Injectable()
export class MetricsService {
  constructor(
    @Inject(RequestAuthenticator) private readonly requestAuthenticator: RequestAuthenticator,
    @Inject(TenantAccessService) private readonly tenantAccessService: TenantAccessService,
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  async summary(authorization: unknown, tenantId: string, days: number): Promise<MetricsSummary> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);

    const desde = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const supabase = this.supabaseServerClientFactory.create();

    const { data: mensajes, error } = await supabase
      .from('messages')
      .select('created_at, direction, channel_account:channel_accounts(platform)')
      .eq('tenant_id', tenantId)
      .gte('created_at', desde)
      .order('created_at', { ascending: false })
      .limit(MAX_ROWS + 1);

    if (error) throw new InternalServerErrorException('No fue posible leer la actividad.');

    const filas = (mensajes ?? []) as Array<Record<string, unknown>>;
    const truncado = filas.length > MAX_ROWS;

    const { count: cerradas, error: cerradasError } = await supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('status', 'resolved');

    if (cerradasError) {
      throw new InternalServerErrorException('No fue posible contar las conversaciones cerradas.');
    }

    return summarizeMessages(
      filas.slice(0, MAX_ROWS).map((fila) => ({
        createdAt: String(fila.created_at),
        direction: String(fila.direction),
        platform:
          (fila.channel_account as { platform?: unknown } | null)?.platform !== undefined
            ? ((fila.channel_account as { platform?: string | null }).platform ?? null)
            : null
      })),
      { closedConversations: cerradas ?? 0, days, truncated: truncado }
    );
  }
}
