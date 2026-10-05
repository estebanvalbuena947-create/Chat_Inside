import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException
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
        'id, status, has_dm, has_comment, outcome, outcome_amount, outcome_currency, last_message_at, created_at, contact:contacts(display_name, external_username, platform_user_id), channel_account:channel_accounts(platform, display_name)'
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

    const fila = conversacion as Record<string, unknown>;
    const contacto = (fila.contact ?? null) as Record<string, unknown> | null;
    const canal = (fila.channel_account ?? null) as Record<string, unknown> | null;

    return {
      conversation: {
        branchId: null,
        channel: canal ? String(canal.platform ?? '') : null,
        channelName: canal ? String(canal.display_name ?? '') : null,
        contactName: contacto ? String(contacto.display_name ?? '') : null,
        contactUsername: contacto ? (contacto.external_username ?? null) : null,
        createdAt: String(fila.created_at ?? ''),
        hasComment: fila.has_comment === true,
        hasDm: fila.has_dm === true,
        id: String(fila.id),
        lastMessageAt: fila.last_message_at ? String(fila.last_message_at) : null,
        outcome: fila.outcome ?? null,
        outcomeAmount: fila.outcome_amount ?? null,
        outcomeCurrency: fila.outcome_currency ?? null,
        platformUserId: contacto ? (contacto.platform_user_id ?? null) : null,
        status: String(fila.status ?? '')
      },
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
      tenantId: identity.tenantId
    };
  }
}
