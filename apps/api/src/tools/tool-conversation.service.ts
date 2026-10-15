import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import {
  conversationStatusPatch,
  handoffToHuman,
  whatsappServiceWindow
} from '@chat-zernio/domain';
import type { AutomationMode, ConversationStatus } from '@chat-zernio/contracts';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { ToolTokenService, type ToolIdentity } from './tool-token.service';

/**
 * Conversaciones para el bot: leerlas y cerrarlas.
 *
 * Es el primer extremo del contrato de herramientas: n8n se autentica con su credencial de maquina y
 * consulta una conversacion con su historial para decidir que responder.
 *
 * Cuatro reglas:
 *   1. El espacio sale SIEMPRE del token, nunca de la peticion. Una credencial pertenece a un
 *      espacio y no puede leer ni cerrar los de otro.
 *   2. La lectura no escribe nada: el bot decide, y el envio es otro extremo.
 *   3. Cerrar y pausar SI se puede, pero solo estas dos cosas: ni asignar (eso es `assignments`) ni
 *      cambiar la sede (eso es un dato del negocio que el bot fija mientras conversa).
 *   4. Las dos escrituras son idempotentes y no piden version: el bot no la conoce. Repetir el mismo
 *      cierre no cambia nada, y si otra persona movio la conversacion en el medio, la respuesta lo
 *      dice en lugar de pisarla en silencio.
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

    // La ventana se consulta aparte y no se deduce del historial: la pagina trae los ultimos 50
    // mensajes, y en un hilo con muchos salientes el ultimo entrante puede quedar fuera de ella.
    const { data: ultimoEntrante, error: entranteError } = await supabase
      .from('messages')
      .select('created_at')
      .eq('tenant_id', identity.tenantId)
      .eq('conversation_id', conversationId)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (entranteError)
      throw new InternalServerErrorException('No fue posible leer la ventana de mensajeria.');

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
      tenantId: identity.tenantId,
      // Si la ventana esta abierta, el bot puede escribir; si esta cerrada, tiene que usar una
      // plantilla aprobada. `null` significa que no aplica o que no se puede afirmar (otro canal, o
      // un hilo sin mensajes entrantes): quien envia decide, y decide el proveedor.
      whatsappWindow:
        String(canal?.platform ?? '')
          .trim()
          .toLowerCase() === 'whatsapp'
          ? whatsappServiceWindow(
              typeof ultimoEntrante?.created_at === 'string' ? ultimoEntrante.created_at : null,
              Date.now()
            )
          : null
    };
  }

  /**
   * Cierra la conversacion y, por defecto, apaga el bot.
   *
   * Es la accion que el bot necesita cuando decide no seguir hablando: cerrar y no volver a
   * contestar. Las dos cosas van en la misma llamada a proposito: cerrar sin apagar dejaria al bot
   * respondiendo en un hilo cerrado, y apagar sin cerrar dejaria la conversacion como pendiente de
   * atencion cuando ya no lo esta. `pauseBot: false` cierra sin tocar el interruptor, para el caso en
   * que el negocio quiera cerrar el hilo y que el bot siga disponible si el cliente escribe.
   */
  async close(authorization: unknown, conversationId: string, rawBody: unknown): Promise<unknown> {
    const identity = await this.toolTokenService.authenticate(authorization);
    this.toolTokenService.assertScope(identity, 'conversations');
    if (!conversationId) throw new UnprocessableEntityException('Hace falta conversationId.');

    const cuerpo = (rawBody ?? {}) as { pauseBot?: unknown };
    const pausar = cuerpo.pauseBot !== false;

    const estado = await this.escribir(
      identity,
      conversationId,
      { status: 'resolved' },
      pausar ? handoffToHuman() : null,
      'bot'
    );
    console.log(
      JSON.stringify({
        automationMode: estado.automationMode,
        conversationId,
        event: 'tools.conversation_closed',
        status: estado.status,
        tenantId: identity.tenantId
      })
    );
    return { ...estado, tenantId: identity.tenantId };
  }

  /**
   * Enciende o apaga el bot sin tocar el estado de la conversacion.
   *
   * Sirve para lo contrario que el cierre: pausar un hilo que sigue abierto --por ejemplo mientras
   * una persona lo atiende-- y volver a encenderlo despues.
   */
  async setAutomation(
    authorization: unknown,
    conversationId: string,
    rawBody: unknown
  ): Promise<unknown> {
    const identity = await this.toolTokenService.authenticate(authorization);
    this.toolTokenService.assertScope(identity, 'conversations');
    if (!conversationId) throw new UnprocessableEntityException('Hace falta conversationId.');

    const cuerpo = (rawBody ?? {}) as { mode?: unknown };
    const modo = cuerpo.mode;
    if (modo !== 'auto' && modo !== 'suggest' && modo !== 'paused') {
      throw new UnprocessableEntityException('mode tiene que ser auto, suggest o paused.');
    }

    const estado = await this.escribir(identity, conversationId, {}, modo);
    return { ...estado, tenantId: identity.tenantId };
  }

  /**
   * Escribe el estado y/o el interruptor del bot sobre una conversacion del espacio del token.
   *
   * Lee primero: asi la operacion es idempotente --repetirla devuelve el estado vigente sin escribir--
   * y no hace falta que el bot conozca la version. La escritura sigue llevando el filtro de version,
   * de modo que si alguien movio la conversacion entre la lectura y la escritura la respuesta es un
   * conflicto visible, no un pisotazo.
   */
  private async escribir(
    identity: ToolIdentity,
    conversationId: string,
    estado: { status?: ConversationStatus },
    modo: AutomationMode | null,
    closureActor: 'bot' | null = null
  ): Promise<{ automationMode: string; conversationId: string; status: string }> {
    const supabase = this.supabaseServerClientFactory.create();
    const { data: actual, error: lecturaError } = await supabase
      .from('conversations')
      .select('id, status, status_version, automation_mode, automation_version')
      .eq('tenant_id', identity.tenantId)
      .eq('id', conversationId)
      .maybeSingle();
    if (lecturaError) {
      throw new InternalServerErrorException('No fue posible leer la conversacion.');
    }
    if (!actual) throw new NotFoundException('La conversacion no existe en este espacio.');

    const fila = actual as Record<string, unknown>;
    const statusActual = String(fila.status ?? 'open') as ConversationStatus;
    const modoActual = String(fila.automation_mode ?? 'auto');
    const versionStatus = Number(fila.status_version ?? 1);
    const versionModo = Number(fila.automation_version ?? 1);

    const cambiaEstado = estado.status !== undefined && estado.status !== statusActual;
    const cambiaModo = modo !== null && modo !== modoActual;
    if (!cambiaEstado && !cambiaModo) {
      return {
        automationMode: modoActual,
        conversationId: String(fila.id ?? conversationId),
        status: statusActual
      };
    }

    const parche: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (cambiaEstado) {
      Object.assign(parche, conversationStatusPatch(estado.status as ConversationStatus));
      parche.closure_actor_type = estado.status === 'resolved' ? closureActor : null;
      parche.closure_actor_user_id = null;
      parche.status_version = versionStatus + 1;
    }
    if (cambiaModo) {
      parche.automation_mode = modo;
      parche.automation_version = versionModo + 1;
    }

    let consulta = supabase
      .from('conversations')
      .update(parche)
      .eq('tenant_id', identity.tenantId)
      .eq('id', conversationId);
    // Solo se filtra por las versiones que se estan cambiando: exigir la del otro campo obligaria al
    // bot a conocer un dato que no necesita y haria fallar el cierre por un cambio de asignacion.
    if (cambiaEstado) consulta = consulta.eq('status_version', versionStatus);
    if (cambiaModo) consulta = consulta.eq('automation_version', versionModo);

    const { data: escrita, error: escrituraError } = await consulta
      .select('id, status, automation_mode')
      .maybeSingle();
    if (escrituraError) {
      throw new InternalServerErrorException('No fue posible actualizar la conversacion.');
    }
    if (!escrita) {
      throw new ConflictException(
        'La conversacion cambio mientras se actualizaba. Vuelve a leerla antes de intentarlo.'
      );
    }

    const resultado = escrita as Record<string, unknown>;
    return {
      automationMode: String(resultado.automation_mode ?? 'auto'),
      conversationId: String(resultado.id ?? conversationId),
      status: String(resultado.status ?? 'open')
    };
  }
}
