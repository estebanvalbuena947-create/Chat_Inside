import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  metricsSummarySchema,
  type MetricsClosure,
  type MetricsResponseTime,
  type MetricsSummary
} from '@chat-zernio/contracts';
import { RequestAuthenticator } from '../auth/request-authenticator';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantAccessService } from '../tenants/tenant-access.service';

/** Tope de lectura. Si se alcanza, el resultado se marca como minimo en lugar de mentir. */
const MAX_ROWS = 20000;

/**
 * Cuando una respuesta de asesor deja de ser buena.
 *
 * Es politica del negocio, no una preferencia de la pantalla: viaja en la respuesta para que la
 * interfaz pinte los colores sin repetir el numero. `amberSeconds` es el limite de lo bueno y
 * `redSeconds` el de lo aceptable: por encima de el, rojo.
 */
export const ADVISOR_RESPONSE_THRESHOLDS = { amberSeconds: 5 * 60, redSeconds: 10 * 60 };

/**
 * Margen hacia atras al buscar respuestas.
 *
 * Una respuesta puede contestar a un mensaje anterior al periodo, y sin ese mensaje no habria con que
 * medirla. Solo cuenta la respuesta que cae dentro del periodo; el margen sirve para encontrar su
 * pareja.
 */
const RESPONSE_LOOKBACK_MS = 24 * 60 * 60 * 1000;

export type MetricRow = {
  createdAt: string;
  direction: string;
  platform: string | null;
};

export type ResponseRow = {
  conversationId: string;
  createdAt: string;
  direction: string;
  senderType: string;
};

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
  options: { since: string }
): MetricsResponseTime {
  const porConversacion = new Map<string, ResponseRow[]>();
  for (const fila of rows) {
    const lista = porConversacion.get(fila.conversationId);
    if (lista) lista.push(fila);
    else porConversacion.set(fila.conversationId, [fila]);
  }

  const esperas: number[] = [];
  for (const lista of porConversacion.values()) {
    lista.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let ultimoEntrante: number | null = null;
    for (const fila of lista) {
      const momento = Date.parse(fila.createdAt);
      if (!Number.isFinite(momento)) continue;
      if (fila.direction === 'inbound') {
        ultimoEntrante = momento;
        continue;
      }
      if (fila.senderType !== 'agent') continue;
      if (ultimoEntrante === null) continue;
      if (fila.createdAt < options.since) continue;
      esperas.push(Math.max(0, Math.round((momento - ultimoEntrante) / 1000)));
      break;
    }
  }

  const { amberSeconds, redSeconds } = ADVISOR_RESPONSE_THRESHOLDS;
  const suma = esperas.reduce((total, segundos) => total + segundos, 0);

  return {
    averageSeconds: esperas.length ? Math.round(suma / esperas.length) : null,
    betweenFiveAndTenMinutes: esperas.filter((s) => s >= amberSeconds && s <= redSeconds).length,
    conversations: esperas.length,
    overTenMinutes: esperas.filter((s) => s > redSeconds).length,
    thresholds: { amberSeconds, redSeconds },
    underFiveMinutes: esperas.filter((s) => s < amberSeconds).length
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
    days: number;
    responseTime: MetricsResponseTime;
    truncated: boolean;
  }
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
    closedConversations: options.closure.byAdvisor + options.closure.byBot,
    closure: options.closure,
    messagesByChannel: [...porCanal.entries()]
      .map(([platform, conteo]) => ({ platform, ...conteo }))
      .sort((a, b) => b.received + b.sent - (a.received + a.sent)),
    messagesPerDay: [...porDia.entries()]
      .map(([date, conteo]) => ({ date, ...conteo }))
      .sort((a, b) => a.date.localeCompare(b.date)),
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

  async summary(authorization: unknown, tenantId: string, days: number): Promise<MetricsSummary> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);

    const ahora = Date.now();
    const desde = new Date(ahora - days * 24 * 60 * 60 * 1000).toISOString();
    const supabase = this.supabaseServerClientFactory.create();

    const actividad = await leerPorPaginas<Record<string, unknown>>(
      (desdeFila, hastaFila) =>
        supabase
          .from('messages')
          .select('created_at, direction, channel_account:channel_accounts(platform)')
          .eq('tenant_id', tenantId)
          .gte('created_at', desde)
          .order('created_at', { ascending: false })
          .range(desdeFila, hastaFila),
      MAX_ROWS,
      'No fue posible leer la actividad.'
    );

    // Respuestas de asesor: se mira un poco mas atras para poder emparejar una respuesta con el
    // mensaje que contesta, aunque ese mensaje sea de antes del periodo.
    const respuestas = await leerPorPaginas<Record<string, unknown>>(
      (desdeFila, hastaFila) =>
        supabase
          .from('messages')
          .select('conversation_id, created_at, direction, sender_type')
          .eq('tenant_id', tenantId)
          .gte(
            'created_at',
            new Date(ahora - days * 24 * 60 * 60 * 1000 - RESPONSE_LOOKBACK_MS).toISOString()
          )
          .order('created_at', { ascending: true })
          .range(desdeFila, hastaFila),
      MAX_ROWS,
      'No fue posible leer los tiempos de respuesta.'
    );

    // Cerradas DENTRO del periodo: `status = 'resolved'` dice cuantas estan cerradas hoy, no cuantas
    // se cerraron en estos dias.
    const cerradas = await leerPorPaginas<{ id?: unknown }>(
      (desdeFila, hastaFila) =>
        supabase
          .from('conversations')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('status', 'resolved')
          .gte('resolved_at', desde)
          .order('resolved_at', { ascending: false })
          .range(desdeFila, hastaFila),
      MAX_ROWS,
      'No fue posible contar las conversaciones cerradas.'
    );

    const resueltasDelPeriodo = cerradas.filas.map((fila) => String(fila.id)).filter(Boolean);

    // Quienes de esas conversaciones tuvieron respuesta de una persona, en cualquier momento: es el
    // hecho que decide si la llevo el bot o un asesor.
    let conAsesor: string[] = [];
    if (resueltasDelPeriodo.length) {
      const { data: humanas, error: humanasError } = await supabase
        .from('messages')
        .select('conversation_id')
        .eq('tenant_id', tenantId)
        .eq('sender_type', 'agent')
        .in('conversation_id', resueltasDelPeriodo);

      if (humanasError) {
        throw new InternalServerErrorException(
          'No fue posible saber quien atendio cada conversación.'
        );
      }
      conAsesor = ((humanas ?? []) as Array<{ conversation_id?: unknown }>).map((fila) =>
        String(fila.conversation_id)
      );
    }

    return summarizeMessages(
      actividad.filas.map((fila) => ({
        createdAt: String(fila.created_at),
        direction: String(fila.direction),
        platform:
          (fila.channel_account as { platform?: unknown } | null)?.platform !== undefined
            ? ((fila.channel_account as { platform?: string | null }).platform ?? null)
            : null
      })),
      {
        closure: summarizeClosure(resueltasDelPeriodo, conAsesor),
        days,
        responseTime: summarizeResponseTimes(
          respuestas.filas.map((fila) => ({
            conversationId: String(fila.conversation_id),
            createdAt: String(fila.created_at),
            direction: String(fila.direction),
            senderType: String(fila.sender_type)
          })),
          { since: desde }
        ),
        truncated: actividad.truncado || respuestas.truncado || cerradas.truncado
      }
    );
  }
}
