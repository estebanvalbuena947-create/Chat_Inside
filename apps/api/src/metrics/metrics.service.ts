import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  metricsSummarySchema,
  type MetricsSummaryQuery,
  type MetricsClosure,
  type MetricsResponseTime,
  type MetricsSummary
} from '@chat-zernio/contracts';
import {
  ATTENTION_THRESHOLDS,
  BUSINESS_TIME_ZONE,
  dayKeyInZone,
  measureResponses,
  operationalInstant,
  shiftCalendarDay,
  type ScheduleVersion
} from '@chat-zernio/domain';
import { responseDetailListSchema, type ResponseDetailList } from '@chat-zernio/contracts';
import { loadWorkSchedules } from '../tenants/work-schedules.service';
import { RequestAuthenticator } from '../auth/request-authenticator';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantAccessService } from '../tenants/tenant-access.service';

/** Tope de lectura. Si se alcanza, el resultado se marca como minimo en lugar de mentir. */
const MAX_ROWS = 20000;

/** Calendar boundaries in the business zone, including historical offset changes. */
export function operationalDayRange(day: string, timeZone = BUSINESS_TIME_ZONE) {
  return {
    start: new Date(operationalInstant(day, 0, timeZone)).toISOString(),
    end: new Date(operationalInstant(shiftCalendarDay(day, 1), 0, timeZone)).toISOString()
  };
}

export type MetricRow = {
  createdAt: string;
  direction: string;
  platform: string | null;
  senderType?: string | null;
};

export type ResponseRow = {
  conversationId: string;
  createdAt: string;
  direction: string;
  senderType: string;
  senderUserId?: string | null;
};

/** Cuenta mensajes salientes por actor. El Bot es `automation`; la identidad humana llega de la fila. */
export function summarizeParticipants(
  rows: ResponseRow[],
  labels = new Map<string, string>(),
  counts = new Map<
    string,
    { closedConversations?: number; executedClosures?: number; wonConversations?: number }
  >(),
  options: { since?: string } = {}
) {
  const values = new Map<
    string,
    { kind: 'advisor' | 'bot'; label: string; messagesSent: number }
  >();
  for (const row of rows) {
    if (
      row.direction !== 'outbound' ||
      !['agent', 'automation'].includes(row.senderType) ||
      (options.since && Date.parse(row.createdAt) < Date.parse(options.since))
    )
      continue;
    const isBot = row.senderType === 'automation';
    const key = isBot
      ? 'bot'
      : row.senderUserId
        ? `advisor:${row.senderUserId}`
        : 'advisor:unknown';
    const current = values.get(key) ?? {
      kind: isBot ? 'bot' : 'advisor',
      label: isBot ? 'Bot' : (labels.get(row.senderUserId ?? '') ?? 'Asesor sin identificar'),
      messagesSent: 0
    };
    current.messagesSent += 1;
    values.set(key, current);
  }
  // Un asesor que solo cerró o registró una ganada también debe verse en la tabla, aunque no haya
  // enviado mensajes en el periodo.
  for (const key of counts.keys()) {
    if (values.has(key)) continue;
    const isBot = key === 'bot';
    const userId = isBot ? '' : key.replace(/^advisor:/, '');
    values.set(key, {
      kind: isBot ? 'bot' : 'advisor',
      label: isBot ? 'Bot' : (labels.get(userId) ?? 'Asesor sin identificar'),
      messagesSent: 0
    });
  }
  const waits = new Map<string, number[]>();
  const byConversation = new Map<string, ResponseRow[]>();
  for (const row of rows)
    byConversation.set(row.conversationId, [
      ...(byConversation.get(row.conversationId) ?? []),
      row
    ]);
  for (const list of byConversation.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let inboundAt: number | null = null;
    for (const row of list) {
      const at = Date.parse(row.createdAt);
      if (row.direction === 'inbound') {
        inboundAt = at;
        continue;
      }
      if (
        inboundAt === null ||
        !Number.isFinite(at) ||
        !['agent', 'automation'].includes(row.senderType) ||
        (options.since !== undefined && at < Date.parse(options.since))
      )
        continue;
      const key =
        row.senderType === 'automation'
          ? 'bot'
          : row.senderUserId
            ? `advisor:${row.senderUserId}`
            : 'advisor:unknown';
      waits.set(key, [...(waits.get(key) ?? []), Math.max(0, Math.round((at - inboundAt) / 1000))]);
      break;
    }
  }
  return [...values.entries()].map(([key, value]) => {
    const durations = waits.get(key) ?? [];
    const participantCounts = counts.get(key);
    return {
      ...value,
      averageFirstResponseSeconds: durations.length
        ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
        : null,
      closedConversations: participantCounts?.closedConversations ?? 0,
      executedClosures: participantCounts?.executedClosures ?? 0,
      firstResponses: durations.length,
      wonConversations: participantCounts?.wonConversations ?? 0
    };
  });
}

/** Reparte las conversaciones cerradas segun quien las atendio. */
export function summarizeClosure(
  resolvedIds: string[],
  advisorConversationIds: Iterable<string>
): MetricsClosure {
  const conAsesor = new Set(advisorConversationIds);
  let byAdvisor = 0;
  for (const id of resolvedIds) {
    if (conAsesor.has(id)) byAdvisor += 1;
  }
  return { byAdvisor, byBot: resolvedIds.length - byAdvisor };
}

/**
 * Tiempo que espero el cliente hasta la primera respuesta de un asesor en el periodo.
 *
 * Se mide la primera y no todas: lo que se quiere saber es cuanto espero el cliente. Lo que manda el
 * bot no cuenta como respuesta de asesor, y una respuesta sin mensaje previo del cliente tampoco:
 * no hay espera que medir.
 */
export function summarizeResponseTimes(
  rows: ResponseRow[],
  options: { since: string; schedules?: ScheduleVersion[] }
): MetricsResponseTime {
  const measurements = measureResponses(rows, options.since, options.schedules);
  const seconds = measurements.map((item) => item.seconds);
  return {
    averageSeconds: seconds.length
      ? Math.round(seconds.reduce((a, b) => a + b, 0) / seconds.length)
      : null,
    workingConversations: measurements.filter((item) => item.basis === 'working').length,
    elapsedConversations: measurements.filter((item) => item.basis === 'elapsed').length,
    conversations: seconds.length,
    underFiveMinutes: measurements.filter((item) => item.bucket === 'under').length,
    betweenFiveAndTenMinutes: measurements.filter((item) => item.bucket === 'between').length,
    overTenMinutes: measurements.filter((item) => item.bucket === 'over').length,
    thresholds: ATTENTION_THRESHOLDS
  };
}

/**
 * Agrega los mensajes por dia y por plataforma.
 *
 * Es una funcion pura a proposito: la regla de conteo se prueba sin base de datos ni red, y el
 * servicio solo se ocupa de traer las filas y de los permisos.
 */
export function summarizeMessages(
  rows: MetricRow[],
  options: {
    closure: MetricsClosure;
    closureActions: MetricsClosure;
    days: number;
    responseTime: MetricsResponseTime;
    participants?: ReturnType<typeof summarizeParticipants>;
    truncated: boolean;
  }
): MetricsSummary {
  const porDia = new Map<string, { received: number; sent: number }>();
  const porCanal = new Map<string, { received: number; sent: number }>();
  let inbound = 0;
  let byBot = 0;
  let byAdvisor = 0;

  for (const fila of rows) {
    const dia = dayKeyInZone(fila.createdAt);
    if (!dia) throw new Error('La actividad contiene una fecha inválida.');
    const esEntrante = fila.direction === 'inbound';
    if (esEntrante) inbound += 1;
    else if (fila.senderType === 'automation') byBot += 1;
    else if (fila.senderType === 'agent') byAdvisor += 1;
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
    closedConversations: options.closure.byAdvisor + options.closure.byBot,
    closure: options.closure,
    closureActions: options.closureActions,
    messageBreakdown: { inbound, byBot, byAdvisor },
    messagesByChannel: [...porCanal.entries()]
      .map(([platform, conteo]) => ({ platform, ...conteo }))
      .sort((a, b) => b.received + b.sent - (a.received + a.sent)),
    messagesPerDay: [...porDia.entries()]
      .map(([date, conteo]) => ({ date, ...conteo }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    participants: options.participants ?? [],
    periodDays: options.days,
    responseTime: options.responseTime,
    totalMessages: rows.length,
    truncated: options.truncated
  });
}

/**
 * El servidor corta cada respuesta en mil filas, aunque se pidan mas.
 *
 * Se descubrio midiendo: una peticion de veinte mil filas devolvio exactamente mil. El resumen
 * anterior pedia `MAX_ROWS + 1` de una vez, asi que contaba mil mensajes y los presentaba como el
 * total del periodo, sin marcar nada. Un numero incompleto disfrazado de cifra.
 */
const PAGE_SIZE = 1000;

/**
 * Lee todas las filas, por paginas, hasta el tope.
 *
 * Devuelve si se alcanzo el tope para que la pantalla pueda decir que la cifra es un minimo en lugar
 * de mentir. El tope existe porque este resumen trae filas para agregarlas en memoria: a mas volumen,
 * lo correcto sera agregar en la base de datos.
 */
export async function leerPorPaginas<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: unknown }>,
  tope: number,
  mensajeDeError: string
): Promise<{ filas: T[]; truncado: boolean }> {
  const filas: T[] = [];
  for (let desde = 0; filas.length <= tope; desde += PAGE_SIZE) {
    const { data, error } = await pagina(desde, desde + PAGE_SIZE - 1);
    if (error) throw new InternalServerErrorException(mensajeDeError);
    const lote = (data ?? []) as T[];
    if (!lote.length) break;
    filas.push(...lote);
    if (lote.length < PAGE_SIZE) break;
  }
  return { filas: filas.slice(0, tope), truncado: filas.length > tope };
}

/** Resumen de actividad de los ultimos dias. Solo lectura. */
@Injectable()
export class MetricsService {
  constructor(
    @Inject(RequestAuthenticator) private readonly requestAuthenticator: RequestAuthenticator,
    @Inject(TenantAccessService) private readonly tenantAccessService: TenantAccessService,
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  async summary(
    authorization: unknown,
    tenantId: string,
    query: MetricsSummaryQuery
  ): Promise<MetricsSummary> {
    const report = await this.report(authorization, tenantId, query);
    return metricsSummarySchema.parse(report);
  }

  async responses(
    authorization: unknown,
    tenantId: string,
    query: MetricsSummaryQuery & {
      bucket: 'under' | 'between' | 'over';
      page: number;
      asOf?: string;
    }
  ): Promise<ResponseDetailList> {
    const report = await this.report(authorization, tenantId, query);
    const items = report.details.filter((item) => item.bucket === query.bucket);
    const pageItems = items.slice((query.page - 1) * 25, query.page * 25);
    const names = new Map<string, string | null>();
    if (pageItems.length) {
      const { data, error } = await this.supabaseServerClientFactory
        .create()
        .from('conversations')
        .select('id,contact:contacts(display_name)')
        .eq('tenant_id', tenantId)
        .in(
          'id',
          pageItems.map((item) => item.conversationId)
        );
      if (error)
        throw new InternalServerErrorException(
          'No fue posible leer los contactos de las conversaciones.'
        );
      for (const row of data ?? []) {
        const contact = Array.isArray(row.contact) ? row.contact[0] : row.contact;
        names.set(row.id, typeof contact?.display_name === 'string' ? contact.display_name : null);
      }
    }
    return responseDetailListSchema.parse({
      items: pageItems.map((item) => ({
        ...item,
        contactName: names.get(item.conversationId) ?? null
      })),
      total: items.length,
      page: query.page,
      pageSize: 25,
      truncated: report.truncated
    });
  }

  private async report(
    authorization: unknown,
    tenantId: string,
    query: MetricsSummaryQuery & { asOf?: string }
  ) {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);

    const ahora = query.asOf ? Math.min(Date.parse(query.asOf), Date.now()) : Date.now();
    const today = dayKeyInZone(new Date(ahora))!;
    const days = query.date ? 1 : query.days;
    const period =
      query.date || query.days === 1
        ? operationalDayRange(query.date ?? today)
        : {
            end: new Date(ahora).toISOString(),
            start: new Date(ahora - days * 24 * 60 * 60 * 1000).toISOString()
          };
    period.end = new Date(Math.min(Date.parse(period.end), ahora)).toISOString();
    const desde = period.start;
    const supabase = this.supabaseServerClientFactory.create();

    const actividad = await leerPorPaginas<Record<string, unknown>>(
      (desdeFila, hastaFila) =>
        supabase
          .from('messages')
          .select('created_at, direction, sender_type, channel_account:channel_accounts(platform)')
          .eq('tenant_id', tenantId)
          .gte('created_at', desde)
          .lt('created_at', period.end)
          .order('created_at', { ascending: false })
          .range(desdeFila, hastaFila),
      MAX_ROWS,
      'No fue posible leer la actividad.'
    );

    // Fetch this period plus the immediately preceding inbound per participating conversation.
    // No fixed lookback and no scan of all historical outgoing activity.
    const respuestas = await leerPorPaginas<Record<string, unknown>>(
      (desdeFila, hastaFila) =>
        supabase
          .from('messages')
          .select('conversation_id, created_at, direction, sender_type, sender_user_id')
          .eq('tenant_id', tenantId)
          .gte('created_at', desde)
          .lt('created_at', period.end)
          .order('created_at', { ascending: false })
          .range(desdeFila, hastaFila),
      MAX_ROWS,
      'No fue posible leer los tiempos de respuesta.'
    );

    const priorInbounds = await leerPorPaginas<Record<string, unknown>>(
      (from, to) =>
        supabase
          .rpc('metrics_prior_inbounds', {
            p_tenant_id: tenantId,
            p_before: desde,
            p_until: period.end
          })
          .range(from, to),
      MAX_ROWS,
      'No fue posible leer los mensajes anteriores a la primera respuesta.'
    );

    // Cerradas DENTRO del periodo: `status = 'resolved'` dice cuantas estan cerradas hoy, no cuantas
    // se cerraron en estos dias.
    const cerradas = await leerPorPaginas<{ id?: unknown; resolved_at?: unknown }>(
      (desdeFila, hastaFila) =>
        supabase
          .from('conversations')
          .select('id, resolved_at')
          .eq('tenant_id', tenantId)
          .eq('status', 'resolved')
          .gte('resolved_at', desde)
          .lt('resolved_at', period.end)
          .order('resolved_at', { ascending: false })
          .range(desdeFila, hastaFila),
      MAX_ROWS,
      'No fue posible contar las conversaciones cerradas.'
    );

    const resueltasDelPeriodo = cerradas.filas.map((fila) => String(fila.id)).filter(Boolean);
    const closedAtByConversation = new Map(
      cerradas.filas.flatMap((fila) =>
        typeof fila.id === 'string' && typeof fila.resolved_at === 'string'
          ? [[fila.id, fila.resolved_at] as const]
          : []
      )
    );

    // Quienes de esas conversaciones tuvieron respuesta de una persona, en cualquier momento: es el
    // hecho que decide si la llevo el bot o un asesor.
    let respuestasHumanas: Array<{
      conversation_id?: unknown;
      sender_user_id?: unknown;
      created_at?: unknown;
    }> = [];
    if (resueltasDelPeriodo.length) {
      const { data: humanas, error: humanasError } = await supabase
        .from('messages')
        .select('conversation_id, sender_user_id, created_at')
        .eq('tenant_id', tenantId)
        .eq('sender_type', 'agent')
        .in('conversation_id', resueltasDelPeriodo);

      if (humanasError) {
        throw new InternalServerErrorException(
          'No fue posible saber quien atendio cada conversación.'
        );
      }
      respuestasHumanas = (humanas ?? []) as typeof respuestasHumanas;
    }

    const cierresAuditados = await leerPorPaginas<{
      closed_by_type?: unknown;
      closed_by_user_id?: unknown;
    }>(
      (desdeFila, hastaFila) =>
        supabase
          .from('conversation_closures')
          .select('closed_by_type, closed_by_user_id')
          .eq('tenant_id', tenantId)
          .gte('closed_at', desde)
          .lt('closed_at', period.end)
          .order('closed_at', { ascending: false })
          .range(desdeFila, hastaFila),
      MAX_ROWS,
      'No fue posible leer la auditoría de cierres.'
    );

    const ganadas = await leerPorPaginas<{
      outcome_set_by?: unknown;
      outcome_set_by_user_id?: unknown;
    }>(
      (desdeFila, hastaFila) =>
        supabase
          .from('conversations')
          .select('outcome_set_by, outcome_set_by_user_id')
          .eq('tenant_id', tenantId)
          .eq('outcome', 'ganado')
          .gte('outcome_set_at', desde)
          .lt('outcome_set_at', period.end)
          .order('outcome_set_at', { ascending: false })
          .range(desdeFila, hastaFila),
      MAX_ROWS,
      'No fue posible leer las conversaciones ganadas.'
    );

    const counts = new Map<
      string,
      { closedConversations?: number; executedClosures?: number; wonConversations?: number }
    >();
    const increment = (
      key: string,
      field: 'closedConversations' | 'executedClosures' | 'wonConversations'
    ) => {
      const value = counts.get(key) ?? {};
      value[field] = (value[field] ?? 0) + 1;
      counts.set(key, value);
    };
    const lastAdvisorByConversation = new Map<string, { userId: string; createdAt: string }>();
    for (const row of respuestasHumanas) {
      if (typeof row.conversation_id !== 'string' || typeof row.sender_user_id !== 'string')
        continue;
      const current = lastAdvisorByConversation.get(row.conversation_id);
      const createdAt = typeof row.created_at === 'string' ? row.created_at : '';
      const closedAt = closedAtByConversation.get(row.conversation_id);
      if (closedAt && createdAt > closedAt) continue;
      if (!current || current.createdAt < createdAt)
        lastAdvisorByConversation.set(row.conversation_id, {
          userId: row.sender_user_id,
          createdAt
        });
    }
    for (const id of resueltasDelPeriodo) {
      const owner = lastAdvisorByConversation.get(id);
      increment(owner ? `advisor:${owner.userId}` : 'bot', 'closedConversations');
    }
    let actionsByBot = 0;
    let actionsByAdvisor = 0;
    for (const row of cierresAuditados.filas) {
      const isBot = row.closed_by_type === 'bot';
      if (isBot) actionsByBot += 1;
      else actionsByAdvisor += 1;
      increment(
        isBot ? 'bot' : `advisor:${String(row.closed_by_user_id ?? 'unknown')}`,
        'executedClosures'
      );
    }
    for (const row of ganadas.filas) {
      const isBot = row.outcome_set_by === 'bot';
      increment(
        isBot ? 'bot' : `advisor:${String(row.outcome_set_by_user_id ?? 'unknown')}`,
        'wonConversations'
      );
    }

    const schedules = await loadWorkSchedules(supabase, tenantId, period.end);

    const responseRows = [...priorInbounds.filas, ...respuestas.filas].map((fila) => ({
      conversationId: String(fila.conversation_id),
      createdAt: String(fila.created_at),
      direction: String(fila.direction),
      senderType: String(fila.sender_type),
      senderUserId: typeof fila.sender_user_id === 'string' ? fila.sender_user_id : null
    }));
    const labels = new Map<string, string>();
    const advisorIds = new Set<string>([
      ...responseRows.flatMap((row) =>
        row.senderType === 'agent' && row.senderUserId ? [row.senderUserId] : []
      ),
      ...[...lastAdvisorByConversation.values()].map((row) => row.userId),
      ...cierresAuditados.filas.flatMap((row) =>
        row.closed_by_type === 'advisor' && typeof row.closed_by_user_id === 'string'
          ? [row.closed_by_user_id]
          : []
      ),
      ...ganadas.filas.flatMap((row) =>
        row.outcome_set_by === 'persona' && typeof row.outcome_set_by_user_id === 'string'
          ? [row.outcome_set_by_user_id]
          : []
      )
    ]);
    await Promise.all(
      [...advisorIds].map(async (id) => {
        const { data } = await supabase.auth.admin.getUserById(id);
        const name = data.user?.user_metadata?.display_name;
        labels.set(
          id,
          typeof name === 'string' && name.trim()
            ? name.trim()
            : (data.user?.email ?? 'Asesor sin identificar')
        );
      })
    );

    const summary = summarizeMessages(
      actividad.filas.map((fila) => ({
        createdAt: String(fila.created_at),
        direction: String(fila.direction),
        senderType: typeof fila.sender_type === 'string' ? fila.sender_type : null,
        platform:
          (fila.channel_account as { platform?: unknown } | null)?.platform !== undefined
            ? ((fila.channel_account as { platform?: string | null }).platform ?? null)
            : null
      })),
      {
        closure: summarizeClosure(resueltasDelPeriodo, lastAdvisorByConversation.keys()),
        closureActions: { byAdvisor: actionsByAdvisor, byBot: actionsByBot },
        days,
        responseTime: summarizeResponseTimes(responseRows, { since: desde, schedules }),
        truncated:
          actividad.truncado ||
          respuestas.truncado ||
          priorInbounds.truncado ||
          cerradas.truncado ||
          cierresAuditados.truncado ||
          ganadas.truncado,
        participants: summarizeParticipants(responseRows, labels, counts, { since: desde })
      }
    );
    return {
      ...summary,
      operationalDate: query.date ?? today,
      updatedAt: new Date(ahora).toISOString(),
      timeZone: BUSINESS_TIME_ZONE,
      details: measureResponses(responseRows, desde, schedules)
    };
  }
}
