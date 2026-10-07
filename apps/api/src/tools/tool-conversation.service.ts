import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { ToolTokenService, type ToolIdentity } from './tool-token.service';

/**
 * Lectura de conversaciones para el bot.
 *
 * Es el primer extremo del contrato de herramientas: n8n se autentica con su credencial de maquina y
 * consulta una conversacion con su historial para decidir que responder.
 *
 * Dos reglas:
 *   1. El espacio sale SIEMPRE del token, nunca de la peticion. Una credencial pertenece a un
 *      espacio y no puede leer los de otro.
 *   2. Solo lectura. Este servicio no escribe nada: el bot decide, y el envio es otro extremo que
 *      ademas esta apagado en modo sombra.
 */

/** Cuantos mensajes se devuelven como maximo, del mas reciente hacia atras. */
export const TOOL_MESSAGES_LIMIT = 50;

@Injectable()
export class ToolConversationService {
  constructor(
    @Inject(ToolTokenService) private readonly toolTokenService: ToolTokenService,
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  /**
   * Fija la sede de la conversacion.
   *
   * El bot decide la sede mientras conversa; a partir de ahi, el catalogo y los precios que consulta
   * son los de esa sede. Sin esto, las herramientas de catalogo no saben que ofrecer.
   *
   * Se guarda el identificador, no el nombre: si el negocio renombra una sede, la conversacion sigue
   * apuntando a la misma. Y es idempotente: fijar la misma sede dos veces no cambia nada.
   */
  async setBranch(
    authorization: unknown,
    conversationId: string,
    rawBody: unknown
  ): Promise<unknown> {
    const identity = await this.toolTokenService.authenticate(authorization);
    this.toolTokenService.assertScope(identity, 'conversations');

    const cuerpo = (rawBody ?? {}) as { branchSlug?: unknown };
    const branchSlug = typeof cuerpo.branchSlug === 'string' ? cuerpo.branchSlug.trim() : '';
    if (!conversationId) throw new UnprocessableEntityException('Hace falta conversationId.');
    if (!branchSlug) throw new UnprocessableEntityException('Hace falta branchSlug.');

    const supabase = this.supabaseServerClientFactory.create();

    // La sede se busca dentro del espacio del token: un slug de otro negocio no existe, y ademas
    // tiene que estar activa -- no se fija una sede retirada.
    const { data: sede, error: sedeError } = await supabase
      .from('branches')
      .select('id, slug, name')
      .eq('tenant_id', identity.tenantId)
      .eq('slug', branchSlug)
      .eq('is_active', true)
      .maybeSingle();
    if (sedeError) throw new InternalServerErrorException('No fue posible leer la sede.');
    if (!sede) throw new NotFoundException('Esa sede no existe o esta inactiva en este espacio.');

    const { data: actualizada, error } = await supabase
      .from('conversations')
      .update({ branch_id: String(sede.id), updated_at: new Date().toISOString() })
      .eq('tenant_id', identity.tenantId)
      .eq('id', conversationId)
      .select('id, branch_id')
      .maybeSingle();
    if (error) throw new InternalServerErrorException('No fue posible fijar la sede.');
    if (!actualizada) throw new NotFoundException('La conversacion no existe en este espacio.');

    return {
      branch: { name: String(sede.name ?? ''), slug: String(sede.slug ?? '') },
      conversationId: String((actualizada as { id?: unknown }).id),
      tenantId: identity.tenantId
    };
  }

  /**
   * Devuelve una conversacion con su contacto y sus ultimos mensajes.
   *
   * El historial llega del mas reciente al mas antiguo, y quien lo consuma decide como ordenarlo:
   * asi el bot puede recortar por presupuesto de contexto sin perder lo ultimo.
   */
  async read(authorization: unknown, conversationId: string): Promise<unknown> {
    const identity: ToolIdentity = await this.toolTokenService.authenticate(authorization);
    this.toolTokenService.assertScope(identity, 'conversations');

    const supabase = this.supabaseServerClientFactory.create();

    const { data: conversacion, error } = await supabase
      .from('conversations')
      .select(
        'id, status, has_dm, has_comment, outcome, outcome_amount, outcome_currency, last_message_at, created_at, automation_mode, assigned_user_id, branch_id, contact:contacts(id, display_name, external_username, platform_user_id), channel_account:channel_accounts(platform, display_name), branches(slug, name)'
      )
      .eq('tenant_id', identity.tenantId)
      .eq('id', conversationId)
      .maybeSingle();

    if (error) throw new InternalServerErrorException('No fue posible leer la conversacion.');
    if (!conversacion) throw new NotFoundException('La conversacion no existe en este espacio.');

    const { data: mensajes, error: mensajesError } = await supabase
      .from('messages')
      .select('id, direction, sender_type, body, status, source, sent_at, comment_state')
      .eq('tenant_id', identity.tenantId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(TOOL_MESSAGES_LIMIT);

    if (mensajesError) throw new InternalServerErrorException('No fue posible leer el historial.');

    // Las etiquetas van en su propia consulta: la relacion anidada devuelve la forma que el contrato
    // pide (una lista de nombres) sin tener que aplanarla aqui.
    const { data: etiquetas, error: etiquetasError } = await supabase
      .from('conversation_labels')
      .select('labels(name)')
      .eq('tenant_id', identity.tenantId)
      .eq('conversation_id', conversationId);

    if (etiquetasError)
      throw new InternalServerErrorException('No fue posible leer las etiquetas.');

    const fila = conversacion as Record<string, unknown>;
    const contacto = (fila.contact ?? null) as Record<string, unknown> | null;
    const canal = (fila.channel_account ?? null) as Record<string, unknown> | null;
    const sede = (fila.branches ?? null) as Record<string, unknown> | null;
    const nombres = (Array.isArray(etiquetas) ? etiquetas : [])
      .map((e) => {
        const etiqueta = (e as Record<string, unknown>).labels;
        if (!etiqueta || typeof etiqueta !== 'object') return null;
        const nombre = (etiqueta as Record<string, unknown>).name;
        return typeof nombre === 'string' ? nombre : null;
      })
      .filter((n): n is string => n !== null);

    // Forma plana, como la define docs/TOOLS_CONTRACT.md. El historial se mantiene porque es el
    // contexto que el bot necesita para decidir: sin el, este extremo no serviria para nada.
    return {
      assignedUserId: fila.assigned_user_id ?? null,
      automationMode: fila.automation_mode ? String(fila.automation_mode) : null,
      branch: sede ? { name: String(sede.name ?? ''), slug: String(sede.slug ?? '') } : null,
      contact: {
        id: contacto ? (contacto.id ?? null) : null,
        name: contacto ? String(contacto.display_name ?? '') : null,
        platform: canal ? String(canal.platform ?? '') : null,
        username: contacto ? (contacto.external_username ?? null) : null
      },
      hasComment: fila.has_comment === true,
      hasDm: fila.has_dm === true,
      id: String(fila.id),
      labels: nombres,
      lastMessageAt: fila.last_message_at ? String(fila.last_message_at) : null,
      messages: (Array.isArray(mensajes) ? mensajes : []).map((m) => {
        const fila2 = m as Record<string, unknown>;
        return {
          body: String(fila2.body ?? ''),
          commentState: fila2.comment_state ?? null,
          direction: String(fila2.direction ?? ''),
          id: String(fila2.id ?? ''),
          senderType: String(fila2.sender_type ?? ''),
          sentAt: fila2.sent_at ? String(fila2.sent_at) : null,
          source: String(fila2.source ?? ''),
          status: String(fila2.status ?? '')
        };
      }),
      outcome: fila.outcome ?? null,
      outcomeAmount: fila.outcome_amount ?? null,
      outcomeCurrency: fila.outcome_currency ?? null,
      status: String(fila.status ?? ''),
      tenantId: identity.tenantId
    };
  }
}
