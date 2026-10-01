import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req
} from '@nestjs/common';
import {
  createConversationNoteSchema,
  tenantIdSchema,
  type ConversationNoteListResponse,
  type ConversationNoteMutationResponse
} from '@chat-zernio/contracts';
import type { FastifyRequest } from 'fastify';
import { ConversationNoteService } from './conversation-note.service';

@Controller('v1/tenants/:tenantId/conversations')
export class ConversationNotesController {
  constructor(@Inject(ConversationNoteService) private readonly service: ConversationNoteService) {}

  @Get(':conversationId/notes')
  async list(
    @Param('tenantId') tenantId: string,
    @Param('conversationId') conversationId: string,
    @Req() request: FastifyRequest
  ): Promise<ConversationNoteListResponse> {
    return this.service.list(
      request.headers.authorization,
      this.parseId(tenantId),
      this.parseId(conversationId)
    );
  }

  @Post(':conversationId/notes')
  async create(
    @Param('tenantId') tenantId: string,
    @Param('conversationId') conversationId: string,
    @Body() rawBody: unknown,
    @Req() request: FastifyRequest
  ): Promise<ConversationNoteMutationResponse> {
    const command = createConversationNoteSchema.safeParse(rawBody);
    if (!command.success) throw new BadRequestException('La nota privada no es valida.');
    return this.service.create(
      request.headers.authorization,
      this.parseId(tenantId),
      this.parseId(conversationId),
      command.data
    );
  }

  private parseId(value: string): string {
    const parsed = tenantIdSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException('El identificador no es valido.');
    return parsed.data;
  }
}
