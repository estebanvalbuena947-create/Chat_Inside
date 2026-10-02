import { Controller, Delete, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { type CommentModerationResponse, type CommentReplyResponse } from '@chat-zernio/contracts';
import { CommentModerationService } from './comment-moderation.service';

/**
 * Acciones sobre comentarios. Ver specs/020-acciones-sobre-comentarios.md.
 *
 * El controlador no decide nada: comprueba que el comentario pertenece a la conversacion y al
 * espacio, y delega. Las reglas viven en el servicio y en el dominio, no aqui.
 */
@Controller('v1/tenants/:tenantId/conversations')
export class CommentModerationController {
  constructor(
    @Inject(CommentModerationService) private readonly service: CommentModerationService
  ) {}

  @Post(':conversationId/messages/:messageId/comment/hide')
  async hide(
    @Param('tenantId') tenantId: string,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Req() request: FastifyRequest
  ): Promise<CommentModerationResponse> {
    return this.service.hide(request.headers.authorization, tenantId, conversationId, messageId);
  }

  @Delete(':conversationId/messages/:messageId/comment/hide')
  async unhide(
    @Param('tenantId') tenantId: string,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Req() request: FastifyRequest
  ): Promise<CommentModerationResponse> {
    return this.service.unhide(request.headers.authorization, tenantId, conversationId, messageId);
  }

  @Delete(':conversationId/messages/:messageId/comment')
  async remove(
    @Param('tenantId') tenantId: string,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Req() request: FastifyRequest
  ): Promise<CommentModerationResponse> {
    return this.service.remove(request.headers.authorization, tenantId, conversationId, messageId);
  }

  @Post(':conversationId/messages/:messageId/comment/reply')
  async reply(
    @Param('tenantId') tenantId: string,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Req() request: FastifyRequest
  ): Promise<CommentReplyResponse> {
    return this.service.reply(
      request.headers.authorization,
      tenantId,
      conversationId,
      messageId,
      request.body
    );
  }

  @Post(':conversationId/messages/:messageId/comment/private-reply')
  async sendPrivateReply(
    @Param('tenantId') tenantId: string,
    @Param('conversationId') conversationId: string,
    @Param('messageId') messageId: string,
    @Req() request: FastifyRequest
  ): Promise<CommentReplyResponse> {
    return this.service.sendPrivateReply(
      request.headers.authorization,
      tenantId,
      conversationId,
      messageId,
      request.body
    );
  }
}
