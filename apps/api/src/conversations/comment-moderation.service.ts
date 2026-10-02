import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  commentModerationResponseSchema,
  commentReplyBodySchema,
  commentReplyResponseSchema,
  type CommentModerationResponse,
  type CommentReplyResponse
} from '@chat-zernio/contracts';
import { RequestAuthenticator } from '../auth/request-authenticator';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantAccessService } from '../tenants/tenant-access.service';
import { ZernioApiClient } from '../zernio/zernio-api.client';

/** Un comentario cargado y listo para actuar: con sus identificadores ya resueltos. */
type CommentContext = {
  accountId: string;
  body: string;
  channelAccountId: string;
  commentId: string;
  conversationId: string;
  messageId: string;
  postId: string;
  privateReplyAt: string | null;
  state: 'deleted' | 'hidden' | 'visible';
  tenantId: string;
};

const COMMENT_STATES = ['deleted', 'hidden', 'visible'] as const;

/**
 * Moderacion de comentarios.
 *
 * La regla que gobierna todo lo de aqui: **primero la plataforma, despues lo nuestro**. El estado
 * local solo se escribe cuando el proveedor confirmo la accion; si falla, la conversacion no miente.
 *
 * Y otra: el texto original nunca se sobrescribe. La primera vez que se toca un comentario se copia
 * a comment_original_body y ahi se queda, aunque despues se edite o se elimine en la plataforma.
 *
 * Ver specs/020-acciones-sobre-comentarios.md.
 */
@Injectable()
export class CommentModerationService {
  constructor(
    @Inject(RequestAuthenticator) private readonly requestAuthenticator: RequestAuthenticator,
    @Inject(TenantAccessService) private readonly tenantAccessService: TenantAccessService,
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory,
    @Inject(ZernioApiClient) private readonly zernioApiClient: ZernioApiClient
  ) {}

  async hide(
    authorization: unknown,
    tenantId: string,
    conversationId: string,
    messageId: string
  ): Promise<CommentModerationResponse> {
    const comment = await this.loadComment(authorization, tenantId, conversationId, messageId);
    await this.zernioApiClient.hideComment({
      accountId: comment.accountId,
      commentId: comment.commentId,
      postId: comment.postId
    });
    return this.persistState(comment, 'hidden');
  }

  async unhide(
    authorization: unknown,
    tenantId: string,
    conversationId: string,
    messageId: string
  ): Promise<CommentModerationResponse> {
    const comment = await this.loadComment(authorization, tenantId, conversationId, messageId);
    await this.zernioApiClient.unhideComment({
      accountId: comment.accountId,
      commentId: comment.commentId,
      postId: comment.postId
    });
    return this.persistState(comment, 'visible');
  }

  async remove(
    authorization: unknown,
    tenantId: string,
    conversationId: string,
    messageId: string
  ): Promise<CommentModerationResponse> {
    const comment = await this.loadComment(authorization, tenantId, conversationId, messageId);
    await this.zernioApiClient.deleteComment({
      accountId: comment.accountId,
      commentId: comment.commentId,
      postId: comment.postId
    });
    return this.persistState(comment, 'deleted');
  }

  /**
   * Responde en publico. La clave de idempotencia la calcula el servidor a partir del comentario y
   * del texto: si el bot reintenta el mismo mensaje, Zernio reproduce la respuesta anterior en vez
   * de publicar dos veces.
   */
  async reply(
    authorization: unknown,
    tenantId: string,
    conversationId: string,
    messageId: string,
    rawBody: unknown
  ): Promise<CommentReplyResponse> {
    const parsed = commentReplyBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new UnprocessableEntityException(
        'La respuesta necesita un texto de hasta 2200 caracteres.'
      );
    }
    const comment = await this.loadComment(authorization, tenantId, conversationId, messageId);
    const idempotencyKey = createHash('sha256')
      .update(`${comment.commentId}:${parsed.data.message}`)
      .digest('hex');

    await this.zernioApiClient.replyToComment({
      accountId: comment.accountId,
      commentId: comment.commentId,
      idempotencyKey,
      message: parsed.data.message,
      postId: comment.postId
    });

    const updated = await this.persistState(comment, 'visible', 'persona');
    void this.recordOutboundReply(comment, parsed.data.message, 'agent');
    return commentReplyResponseSchema.parse({
      ...updated,
      privateReplyAvailable: comment.privateReplyAt === null
    });
  }

  /**
   * Responde en privado, que abre un mensaje directo con quien comento. Es un recurso de un solo
   * uso: si ya se gasto, no se llama al proveedor. El limite de siete dias lo aplica la plataforma,
   * y su motivo se muestra tal cual, sin inventar uno propio.
   */
  async sendPrivateReply(
    authorization: unknown,
    tenantId: string,
    conversationId: string,
    messageId: string,
    rawBody: unknown
  ): Promise<CommentReplyResponse> {
    const parsed = commentReplyBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new UnprocessableEntityException(
        'La respuesta necesita un texto de hasta 2200 caracteres.'
      );
    }
    const comment = await this.loadComment(authorization, tenantId, conversationId, messageId);

    if (comment.privateReplyAt !== null) {
      throw new UnprocessableEntityException(
        'La respuesta privada de este comentario ya se envio: solo se permite una.'
      );
    }

    await this.zernioApiClient.sendPrivateReply({
      accountId: comment.accountId,
      commentId: comment.commentId,
      message: parsed.data.message,
      postId: comment.postId
    });

    const now = new Date().toISOString();
    const { error } = await this.supabaseServerClientFactory
      .create()
      .from('messages')
      .update({ comment_private_reply_at: now, updated_at: now })
      .eq('tenant_id', tenantId)
      .eq('id', comment.messageId);
    if (error) {
      throw new InternalServerErrorException(
        'La respuesta privada se envio, pero no se pudo registrar en la conversacion.'
      );
    }

    void this.recordOutboundReply(comment, parsed.data.message, 'agent');
    return commentReplyResponseSchema.parse({
      commentState: comment.state,
      messageId: comment.messageId,
      privateReplyAvailable: false
    });
  }

  /** Autentica, comprueba el espacio y carga el comentario con sus identificadores. */
  private async loadComment(
    authorization: unknown,
    tenantId: string,
    conversationId: string,
    messageId: string
  ): Promise<CommentContext> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);

    const { data, error } = await this.supabaseServerClientFactory
      .create()
      .from('messages')
      .select(
        'id, body, source, comment_state, comment_original_body, comment_private_reply_at, platform_post_id, provider_message_id, conversation_id, channel_account_id, channel_account:channel_accounts(provider_account_id)'
      )
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversationId)
      .eq('id', messageId)
      .maybeSingle();

    if (error) throw new InternalServerErrorException('No fue posible cargar el comentario.');
    if (!data) throw new NotFoundException('El mensaje no existe en esta conversacion.');

    const row = data as Record<string, unknown>;
    if (row.source !== 'comment') {
      throw new UnprocessableEntityException('El mensaje no es un comentario.');
    }

    // provider_message_id tiene la forma zernio:<cuenta>:comment:<id del comentario>.
    const partes = String(row.provider_message_id ?? '').split(':');
    const commentId = partes.length === 4 && partes[2] === 'comment' ? partes[3] : '';
    const accountId = String(
      (row.channel_account as { provider_account_id?: unknown } | null)?.provider_account_id ?? ''
    );
    const postId = String(row.platform_post_id ?? '');
    const state = String(row.comment_state ?? 'visible') as CommentContext['state'];

    if (!commentId || !accountId) {
      throw new UnprocessableEntityException('El comentario no tiene identificadores utilizables.');
    }
    if (!postId) {
      throw new UnprocessableEntityException(
        'Este comentario no tiene publicacion registrada, asi que no se puede moderar.'
      );
    }

    return {
      accountId,
      body: String(row.body ?? ''),
      channelAccountId: String(row.channel_account_id ?? ''),
      commentId,
      conversationId,
      messageId: String(row.id),
      postId,
      privateReplyAt: row.comment_private_reply_at ? String(row.comment_private_reply_at) : null,
      state: COMMENT_STATES.includes(state) ? state : 'visible',
      tenantId
    };
  }

  /**
   * Escribe el estado confirmado por la plataforma. La primera vez guarda tambien el texto original,
   * que no se vuelve a tocar nunca.
   */
  private async persistState(
    comment: CommentContext,
    state: CommentContext['state'],
    replyBy?: 'bot' | 'persona'
  ): Promise<CommentModerationResponse> {
    const now = new Date().toISOString();
    const cambios: Record<string, unknown> = {
      comment_moderated_at: now,
      comment_state: state,
      updated_at: now
    };
    if (state === 'deleted' && comment.state === 'visible') {
      cambios.comment_original_body = comment.body;
    }
    if (replyBy) cambios.comment_reply_by = replyBy;

    const { error } = await this.supabaseServerClientFactory
      .create()
      .from('messages')
      .update(cambios)
      .eq('tenant_id', comment.tenantId)
      .eq('id', comment.messageId);
    if (error) {
      throw new InternalServerErrorException(
        'La accion se aplico en la plataforma, pero no se pudo registrar en la conversacion.'
      );
    }

    return commentModerationResponseSchema.parse({
      commentState: state,
      messageId: comment.messageId
    });
  }

  /**
   * Guarda la respuesta como mensaje saliente de la conversacion, para que el hilo quede entero.
   * No bloquea la respuesta al usuario: si fallara, la accion en la plataforma ya ocurrio.
   */
  private async recordOutboundReply(
    comment: CommentContext,
    body: string,
    senderType: 'agent' | 'automation'
  ): Promise<void> {
    await this.supabaseServerClientFactory.create().from('messages').insert({
      body,
      channel_account_id: comment.channelAccountId,
      conversation_id: comment.conversationId,
      direction: 'outbound',
      sender_type: senderType,
      sent_at: new Date().toISOString(),
      source: 'comment',
      status: 'sent',
      tenant_id: comment.tenantId
    });
  }
}
