import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { ToolTokenService } from './tool-token.service';

/**
 * Asignaciones y etiquetas para el bot.
 *
 * El bot necesita poder derivar una conversacion a una persona y consultar las etiquetas del
 * espacio. Asignar NO envia nada al cliente, asi que es seguro incluso en modo sombra.
 *
 * Tres reglas:
 *   1. El espacio sale del token, nunca de la peticion.
 *   2. Solo se puede asignar a quien pertenece al espacio: se comprueba contra las membresias.
 *   3. La asignacion lleva version. Dos personas asignando a la vez no se pisan: la segunda recibe
 *      un conflicto claro en lugar de sobrescribir a la primera en silencio.
 */

@Injectable()
export class ToolAssignmentsService {
  constructor(
    @Inject(ToolTokenService) private readonly toolTokenService: ToolTokenService,
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  /** Deriva una conversacion a una persona del espacio. */
  async assign(authorization: unknown, rawBody: unknown): Promise<unknown> {
    const identity = await this.toolTokenService.authenticate(authorization);
    this.toolTokenService.assertScope(identity, 'assignments');

    const cuerpo = (rawBody ?? {}) as { conversationId?: unknown; userId?: unknown };
    const conversationId = typeof cuerpo.conversationId === 'string' ? cuerpo.conversationId : '';
    const userId = typeof cuerpo.userId === 'string' ? cuerpo.userId : '';
    if (!conversationId || !userId) {
      throw new UnprocessableEntityException('Hacen falta conversationId y userId.');
    }

    const supabase = this.supabaseServerClientFactory.create();

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

    const { data: conversacion, error: conversacionError } = await supabase
      .from('conversations')
      .select('id, assignment_version')
      .eq('tenant_id', identity.tenantId)
      .eq('id', conversationId)
      .maybeSingle();
    if (conversacionError) {
      throw new InternalServerErrorException('No fue posible leer la conversacion.');
    }
    if (!conversacion) throw new NotFoundException('La conversacion no existe en este espacio.');

    const version = Number(
      (conversacion as { assignment_version?: unknown }).assignment_version ?? 0
    );

    const { data: actualizada, error } = await supabase
      .from('conversations')
      .update({
        assigned_user_id: userId,
        assignment_version: version + 1,
        updated_at: new Date().toISOString()
      })
      .eq('tenant_id', identity.tenantId)
      .eq('id', conversationId)
      .eq('assignment_version', version)
      .select('id, assigned_user_id, assignment_version')
      .maybeSingle();

    if (error) throw new InternalServerErrorException('No fue posible asignar la conversacion.');
    if (!actualizada) {
      throw new ConflictException(
        'Otra persona cambio la asignacion al mismo tiempo. Vuelve a intentarlo.'
      );
    }

    return {
      assignmentVersion: Number(
        (actualizada as { assignment_version?: unknown }).assignment_version
      ),
      conversationId: String((actualizada as { id?: unknown }).id),
      tenantId: identity.tenantId,
      userId: (actualizada as { assigned_user_id?: unknown }).assigned_user_id ?? null
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
