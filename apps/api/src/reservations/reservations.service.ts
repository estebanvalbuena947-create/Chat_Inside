import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  InternalServerErrorException
} from '@nestjs/common';
import {
  reservationsBoardResponseSchema,
  type ReservationsBoardResponse,
  type ReservationDraftView,
  type ReservationConfirmedView,
  type ReservationDecisionView,
  type ReservationReceiptView
} from '@chat-zernio/contracts';
import {
  buildReservationKpis,
  normalizeConfirmed,
  normalizeDecision,
  normalizeDraft,
  normalizeReceipt,
  type ReservationConfirmed,
  type ReservationDecision,
  type ReservationDraft,
  type ReservationReceipt
} from '@chat-zernio/domain';
import { createReservationsSupabaseClient, type SupabaseServerClient } from '@chat-zernio/config';
import { RequestAuthenticator } from '../auth/request-authenticator';
import { TenantAccessService } from '../tenants/tenant-access.service';

/**
 * Tablas del proyecto de reservas. Los nombres y las columnas salen de `js/data.js` del dashboard que
 * el equipo usa hoy: no se adivinan.
 */
const TABLAS = {
  comprobantes: 'spa_comprobantes_pago',
  confirmadas: 'reservas',
  decisiones: 'dashboard_reservation_decisions',
  preReservas: 'reservas_draft'
} as const;

const COLUMNAS = {
  // Se leen todas las columnas a proposito, como hace el dashboard cuando su lista explicita falla:
  // esa base no tiene garantizado el mismo esquema, y pedir una columna que no existe tumba la
  // lectura entera. La lista precisa se puede recuperar cuando el esquema este confirmado.
  comprobantes: '*',
  confirmadas: '*',
  decisiones: '*',
  preReservas: '*'
} as const;

/** Orden de lectura, con respaldo: si una columna no existe, se prueba la siguiente. */
const ORDEN = {
  comprobantes: ['actualizado_at', 'creado_at', 'reserva_draft_id'],
  confirmadas: ['id'],
  decisiones: ['created_at', 'id'],
  preReservas: ['comprobante_revision_at', 'id']
} as const;

/** Tope de lectura por tabla. El dashboard usaba 500; aqui se pagina hasta este tope. */
const PAGE_SIZE = 500;
const MAX_ROWS = 2000;

const asIso = (value: Date | null): string | null => (value ? value.toISOString() : null);
const asText = (value: Date | unknown): string | null =>
  value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : null;

/** Lee una tabla completa, por paginas, probando las ordenaciones disponibles. */
async function fetchTable(
  supabase: SupabaseServerClient,
  table: string,
  columns: string,
  order: readonly string[],
  what: string
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];

  // El ultimo intento es SIN ordenar. Esa base no garantiza que exista la columna por la que se
  // quiere ordenar, y el dashboard ya lee las reservas confirmadas sin orden: ordenar es una
  // comodidad, no un requisito para poder mostrar los datos.
  for (const orderBy of [...order, null]) {
    rows.length = 0;
    let fallo: unknown = null;

    for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
      const base = supabase.from(table).select(columns);
      const respuesta = await (orderBy
        ? base.order(orderBy, { ascending: true }).range(from, from + PAGE_SIZE - 1)
        : base.range(from, from + PAGE_SIZE - 1));

      if (respuesta.error) {
        fallo = respuesta.error;
        break;
      }

      const lote = (respuesta.data ?? []) as unknown as Record<string, unknown>[];
      rows.push(...lote);
      if (lote.length < PAGE_SIZE) break;
    }

    if (!fallo) return rows;
  }

  throw new InternalServerErrorException(`No fue posible leer ${what} del proyecto de reservas.`);
}

/**
 * Tablero de reservas.
 *
 * Lee el proyecto SPA **desde el servidor** —la clave nunca llega al navegador—, traduce las filas con
 * los normalizadores del dominio y calcula los KPIs con las mismas reglas que el dashboard. Aqui no
 * hay reglas nuevas: solo consulta, traduccion y armado de la respuesta.
 */
@Injectable()
export class ReservationsService {
  constructor(
    @Inject(RequestAuthenticator) private readonly requestAuthenticator: RequestAuthenticator,
    @Inject(TenantAccessService) private readonly tenantAccessService: TenantAccessService
  ) {}

  async board(
    authorization: unknown,
    tenantId: string,
    now: Date = new Date()
  ): Promise<ReservationsBoardResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    // Solo quien gestiona reservas: un agente no ve dinero ni decide comprobantes.
    await this.tenantAccessService.assertRole(identity.userId, tenantId, ['admin', 'supervisor']);

    const supabase = createReservationsSupabaseClient(process.env);
    if (!supabase) {
      throw new ServiceUnavailableException(
        'El tablero de reservas todavía no está configurado en este servidor.'
      );
    }

    const [preReservas, confirmadas, decisiones, comprobantes] = await Promise.all([
      fetchTable(
        supabase,
        TABLAS.preReservas,
        COLUMNAS.preReservas,
        ORDEN.preReservas,
        'las pre-reservas'
      ),
      fetchTable(
        supabase,
        TABLAS.confirmadas,
        COLUMNAS.confirmadas,
        ORDEN.confirmadas,
        'las reservas confirmadas'
      ),
      fetchTable(
        supabase,
        TABLAS.decisiones,
        COLUMNAS.decisiones,
        ORDEN.decisiones,
        'las decisiones'
      ),
      fetchTable(
        supabase,
        TABLAS.comprobantes,
        COLUMNAS.comprobantes,
        ORDEN.comprobantes,
        'los comprobantes'
      )
    ]);

    const borradores = preReservas.map(normalizeDraft);
    const confirmadasNorm = confirmadas.map(normalizeConfirmed);
    const decisionesNorm = decisiones.map(normalizeDecision);
    const comprobantesNorm = comprobantes.map(normalizeReceipt);

    const { estados, kpis } = buildReservationKpis(
      borradores,
      confirmadasNorm,
      decisionesNorm,
      comprobantesNorm,
      { now }
    );

    return reservationsBoardResponseSchema.parse({
      actualizadoEn: now.toISOString(),
      comprobantes: comprobantesNorm.map(toReceiptView),
      confirmadas: confirmadasNorm.map(toConfirmedView),
      decisiones: decisionesNorm.map(toDecisionView),
      kpis,
      preReservas: borradores.map((draft) => toDraftView(draft, estados.get(draft.id) ?? 'pending'))
    });
  }
}

function toDraftView(draft: ReservationDraft, estadoMostrado: string): ReservationDraftView {
  return {
    actualizadaEn: draft.actualizadaEn,
    cerradaEn: asIso(draft.cerradaEn),
    confirmada: draft.confirmada,
    confirmadaEn: draft.confirmadaEn,
    correo: draft.correo,
    creadaEn: draft.creadaEn,
    entroEn: asIso(draft.entroEn),
    estado: draft.estado,
    estadoMostrado: estadoMostrado as ReservationDraftView['estadoMostrado'],
    evidencia: draft.evidencia,
    horarioPendiente: draft.horarioPendiente,
    horarioProgramado: asIso(draft.horarioProgramado),
    id: draft.id,
    intentosPago: draft.intentosPago,
    motivoRevision: draft.motivoRevision,
    motivosPago: draft.motivosPago,
    monto: draft.monto,
    montoEsperado: draft.montoEsperado,
    nombre: draft.nombre,
    pagoRecibido: draft.pagoRecibido,
    procesandoDesde: asIso(draft.procesandoDesde),
    retencionExpiraEn: asIso(draft.retencionExpiraEn),
    revisadaEn: draft.revisadaEn,
    servicio: draft.servicio,
    servicioCodigo: draft.servicioCodigo,
    telefono: draft.telefono
  };
}

function toConfirmedView(row: ReservationConfirmed): ReservationConfirmedView {
  return {
    confirmadaEn: row.confirmadaEn,
    correo: row.correo,
    horarioProgramado: asIso(row.horarioProgramado),
    id: row.id,
    monto: row.monto,
    nombre: row.nombre,
    servicio: row.servicio,
    sucursal: row.sucursal,
    telefono: row.telefono
  };
}

function toDecisionView(row: ReservationDecision): ReservationDecisionView {
  return {
    accion: row.accion,
    autor: row.autor,
    borradorId: row.borradorId,
    creadaEn: row.creadaEn,
    estadoAnterior: row.estadoAnterior,
    estadoResultante: row.estadoResultante,
    id: row.id,
    nota: row.nota
  };
}

function toReceiptView(row: ReservationReceipt): ReservationReceiptView {
  return {
    actualizadoEn: row.actualizadoEn,
    banco: row.banco,
    borradorId: row.borradorId,
    confianza: row.confianza,
    cuenta: row.cuenta,
    desdeEvidencia: row.desdeEvidencia,
    estado: row.estado,
    mediaUrl: row.mediaUrl,
    metodo: row.metodo,
    monto: row.monto,
    montoEsperado: row.montoEsperado,
    motivos: row.motivos,
    pagadoEn: asText(row.pagadoEn),
    recibidoEn: row.recibidoEn,
    referencia: row.referencia,
    titular: row.titular
  };
}
