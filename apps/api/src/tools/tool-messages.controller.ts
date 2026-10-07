import { Controller, Inject, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ToolMessagesService } from './tool-messages.service';

/** Envio de mensajes para el bot, con credencial de maquina. */
@Controller('v1/tools')
export class ToolMessagesController {
  constructor(@Inject(ToolMessagesService) private readonly service: ToolMessagesService) {}

  @Post('messages')
  async send(@Req() request: FastifyRequest): Promise<unknown> {
    return this.service.send(request.headers.authorization, request.body);
  }
}
