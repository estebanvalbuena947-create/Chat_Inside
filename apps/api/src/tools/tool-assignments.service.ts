import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import { handoffToHuman } from '@chat-zernio/domain';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { advisorActiveAfter } from '../tenants/advisor-presence.rule';
import { ToolTokenService } from './tool-token.service';

/**
 * Asignaciones y etiquetas para el bot.
 *
 * El bot necesita poder derivar una conversacion a una persona y consultar las etiquetas del
 * espacio. Asignar NO envia nada al cliente, asi que es seguro incluso en modo sombra.
 *
 * Cuatro reglas:
 *   1. El espacio sale del token, nunca de la peticion.
 *   2. Una persona concreta debe pertenecer al espacio; sin persona se selecciona una presencia activa.
 *   3. La asignacion lleva version. Dos personas asignando a la vez no se pisan: la segunda recibe
 *      un conflicto claro en lugar de sobrescribir a la primera en silencio.
 *   4. Repetir la MISMA peticion no cambia de persona. Si la conversacion ya esta derivada y el bot
 *      apagado, se devuelve esa asignacion sin gastar el turno de la rotacion: n8n reintenta ante un
 *      timeout, y un reintento no puede mover la conversacion a otra asesora.
 */

@Injectable()
export class ToolAssignmentsService {
  constructor(
    @Inject(ToolTokenService) private readonly toolTokenService: ToolTokenService,
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  /** Deriva una conversacion a una persona del espacio o a la siguiente presencia activa. */
  async assign(authorization: unknown, rawBody: unknown): Promise<unknown> {
    const identity = await this.toolTokenService.authenticate(authorization);
    this.toolTokenService.assertScope(identity, 'assignments');

    const cuerpo = (rawBody ?? {}) as {
      conversationId?: unknown;
      turnBotOff?: unknown;
      userId?: unknown;
    };
    const conversationId = typeof cuerpo.conversationId === 'string' ? cuerpo.conversationId : '';
    let userId = typeof cuerpo.userId === 'string' ? cuerpo.userId : '';
    // El contrato dice que por defecto se apaga el bot al derivar, y tiene sentido: si sigue
    // contestando, la asesora y el bot hablarian a la vez. Solo se enciende si se pide lo contrario.
    const apagarBot = cuerpo.turnBotOff !== false;
    if (!conversationId) throw new UnprocessableEntityException('Hace falta conversationId.');

    const supabase = this.supabaseServerClientFactory.create();

    // La conversacion se lee ANTES de reclamar turno de rotacion. Si no existe, o ya esta en manos
    // de una persona, no se debe gastar el turno de nadie: la rotacion avanza al reclamar, y un
    // fallo posterior dejaria a la siguiente asesora recibiendo la conversacion que no era.
    const { data: conversacion, error: conversacionError } = await supabase
      .from('conversations')
      .select('id, assigned_user_id, automation_mode, assignment_version, automation_version')
      .eq('tenant_id', identity.tenantId)
      .eq('id', conversationId)
      .maybeSingle();
    if (conversacionError) {
      throw new InternalServerErrorException('No fue posible leer la conversacion.');
    }
    if (!conversacion) throw new NotFoundException('La conversacion no existe en este espacio.');

    const filaConversacion = conversacion as {
      assigned_user_id?: unknown;
      automation_mode?: unknown;
      assignment_version?: unknown;
      automation_version?: unknown;
      id?: unknown;
    };
    const version = Number(filaConversacion.assignment_version ?? 0);
    const versionAutomatizacion = Number(filaConversacion.automation_version ?? 0);
    const yaAsignada =
      typeof filaConversacion.assigned_user_id === 'string' &&
      filaConversacion.assigned_user_id.length > 0;

    // Reintento: n8n repite una peticion que ya se aplico (timeout, 5xx). Sin esto, el reintento
    // rotaria a la SIGUIENTE asesora y la conversacion cambiaria de manos sola. La asignacion
    // explicita ya respondia asi (409); la rotativa devuelve la que ya estaba puesta.
    if (
      !userId &&
      apagarBot &&
      yaAsignada &&
      String(filaConversacion.automation_mode ?? '') === handoffToHuman()
    ) {
      return {
        assignedUserId: filaConversacion.assigned_user_id,
        assignmentVersion: version,
        automationMode: handoffToHuman(),
        conversationId: String(filaConversacion.id ?? conversationId),
        tenantId: identity.tenantId,
        userId: filaConversacion.assigned_user_id
      };
    }

    if (!userId) {
      const { data, error } = await supabase.rpc('claim_next_active_advisor', {
        p_active_after: advisorActiveAfter(),
        p_tenant_id: identity.tenantId
      });
      if (error) {
        throw new InternalServerErrorException('No fue posible seleccionar un asesor disponible.');
      }
      userId = typeof data === 'string' ? data : '';
      if (!userId) {
        throw new UnprocessableEntityException(
          'No hay asesores activos disponibles para la transferencia.'
        );
      }
    } else {
      const { data: membresia, error: membresiaError } = await supabase
        .from('memberships')
        .select('user_id')
        .eq('tenant_id', identity.tenantId)
        .eq('user_id', userId)
        .maybeSingle();
      if (membresiaError) {
        throw new InternalServerErrorException('No fue posible comprobar la membresia.');
      }
      if (!membresia) {
        throw new UnprocessableEntityException('Esa persona no pertenece a este espacio.');
      }
    }

    const { data: actualizada, error } = await supabase
      .from('conversations')
      .update({
        assigned_user_id: userId,
        assignment_version: version + 1,
        // La regla la dice el dominio, no este archivo: si algun dia el modo de traspaso cambia,
        // cambia en un solo sitio. Y sube su version, para que dos cambios a la vez no se pisen.
        ...(apagarBot
          ? { automation_mode: handoffToHuman(), automation_version: versionAutomatizacion + 1 }
          : {}),
        updated_at: new Date().toISOString()
      })
      .eq('tenant_id', identity.tenantId)
      .eq('id', conversationId)
      .eq('assignment_version', version)
      .eq('automation_version', versionAutomatizacion)
      .select('id, assigned_user_id, assignment_version')
      .maybeSingle();

    if (error) throw new InternalServerErrorException('No fue posible asignar la conversacion.');
    if (!actualizada) {
      throw new ConflictException(
        'Otra persona cambio la asignacion al mismo tiempo. Vuelve a intentarlo.'
      );
    }

    // La transferencia es un hecho histórico: el modo actual no permite saber cuándo ni a quién
    // derivó el Bot. Se registra sólo cuando el propio Bot pide apagar la automatización.
    if (apagarBot) {
      const { error: handoffError } = await supabase.from('bot_handoffs').insert({
        assigned_user_id: userId,
        conversation_id: conversationId,
        tenant_id: identity.tenantId
      });
      if (handoffError) {
        throw new InternalServerErrorException(
          'No fue posible registrar la transferencia del Bot.'
        );
      }
    }

    const asignado = (actualizada as { assigned_user_id?: unknown }).assigned_user_id ?? null;
    return {
      assignedUserId: asignado,
      assignmentVersion: Number(
        (actualizada as { assignment_version?: unknown }).assignment_version
      ),
      automationMode: apagarBot ? handoffToHuman() : 'auto',
      conversationId: String((actualizada as { id?: unknown }).id),
      tenantId: identity.tenantId,
      userId: asignado
    };
  }

  /**
   * Aplica etiquetas a una conversacion, creando las que no existan en el espacio.
   *
   * Es la pieza que permite al bot marcar "no insistir" en una conversacion, y eso es lo que evita
   * que los seguimientos sigan llegando a quien pidio que no le escribieran.
   *
   * Idempotente: aplicar dos veces la misma etiqueta no duplica nada. Se puede llamar sin miedo.
   */
  async applyLabels(
    authorization: unknown,
    conversationId: string,
    rawBody: unknown
  ): Promise<unknown> {
    const identity = await this.toolTokenService.authenticate(authorization);
    this.toolTokenService.assertScope(identity, 'conversations');

    const cuerpo = (rawBody ?? {}) as { labels?: unknown };
    const nombres = (Array.isArray(cuerpo.labels) ? cuerpo.labels : [])
      .map((valor) => (typeof valor === 'string' ? valor.trim() : ''))
      .filter((nombre) => nombre.length > 0 && nombre.length <= 60);
    if (!conversationId) throw new UnprocessableEntityException('Hace falta conversationId.');
    if (nombres.length === 0) {
      throw new UnprocessableEntityException('Hacen falta etiquetas con nombre.');
    }
    if (nombres.length > 20) {
      throw new UnprocessableEntityException('Demasiadas etiquetas en una sola llamada.');
    }

    const supabase = this.supabaseServerClientFactory.create();

    const { data: conversacion, error: conversacionError } = await supabase
      .from('conversations')
      .select('id')
      .eq('tenant_id', identity.tenantId)
      .eq('id', conversationId)
      .maybeSingle();
    if (conversacionError) {
      throw new InternalServerErrorException('No fue posible leer la conversacion.');
    }
    if (!conversacion) throw new NotFoundException('La conversacion no existe en este espacio.');

    // Se crean las que falten: el contrato lo pide, y ademas evita que el bot tenga que saber de
    // antemano que etiquetas existen.
    const { data: existentes, error: existentesError } = await supabase
      .from('labels')
      .select('id, name')
      .eq('tenant_id', identity.tenantId)
      .in('name', nombres);
    if (existentesError) {
      throw new InternalServerErrorException('No fue posible leer las etiquetas.');
    }
    const conocidas = new Set(
      (Array.isArray(existentes) ? existentes : []).map((fila) =>
        String((fila as Record<string, unknown>).name ?? '')
      )
    );
    const nuevas = nombres.filter((nombre) => !conocidas.has(nombre));
    if (nuevas.length > 0) {
      const { error: crearError } = await supabase
        .from('labels')
        .insert(nuevas.map((name) => ({ name, tenant_id: identity.tenantId })));
      if (crearError) throw new InternalServerErrorException('No fue posible crear las etiquetas.');
    }

    const { data: todas, error: todasError } = await supabase
      .from('labels')
      .select('id, name')
      .eq('tenant_id', identity.tenantId)
      .in('name', nombres);
    if (todasError) throw new InternalServerErrorException('No fue posible leer las etiquetas.');

    const filas = (Array.isArray(todas) ? todas : []).map((fila) => ({
      conversation_id: conversationId,
      label_id: String((fila as Record<string, unknown>).id ?? ''),
      tenant_id: identity.tenantId
    }));

    if (filas.length > 0) {
      const { error: aplicarError } = await supabase
        .from('conversation_labels')
        .upsert(filas, { ignoreDuplicates: true, onConflict: 'conversation_id,label_id' });
      if (aplicarError) {
        throw new InternalServerErrorException('No fue posible aplicar las etiquetas.');
      }
    }

    return {
      conversationId,
      labels: (Array.isArray(todas) ? todas : []).map((fila) =>
        String((fila as Record<string, unknown>).name ?? '')
      ),
      tenantId: identity.tenantId
    };
  }

  /** Las etiquetas del espacio, para que el bot sepa cuales existen antes de usar una. */
  async listLabels(authorization: unknown): Promise<unknown> {
    const identity = await this.toolTokenService.authenticate(authorization);
    this.toolTokenService.assertScope(identity, 'conversations');

    const supabase = this.supabaseServerClientFactory.create();
    const { data, error } = await supabase
      .from('labels')
      .select('id, name, color')
      .eq('tenant_id', identity.tenantId)
      .order('name', { ascending: true });

    if (error) throw new InternalServerErrorException('No fue posible leer las etiquetas.');

    return {
      labels: (Array.isArray(data) ? data : []).map((fila) => {
        const l = fila as Record<string, unknown>;
        return {
          color: l.color ? String(l.color) : null,
          id: String(l.id),
          name: String(l.name ?? '')
        };
      }),
      tenantId: identity.tenantId
    };
  }
}
