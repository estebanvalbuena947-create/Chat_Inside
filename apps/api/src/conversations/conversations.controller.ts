import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req
} from '@nestjs/common';
import {
  conversationMessageListQuerySchema,
  conversationListQuerySchema,
  createOutboundMessageSchema,
  markConversationReadSchema,
  tenantIdSchema,
  updateConversationAutomationSchema,
  updateConversationAssignmentSchema,
  updateConversationStatusSchema,
  type ConversationListResponse,
  type ConversationWonResponse,
  type ConversationMessageListResponse,
  type CreateOutboundMessageResponse,
  type MarkConversationReadResponse,
  type UpdateConversationAutomationResponse,
  type UpdateConversationStatusResponse,
  type UpdateConversationAssignmentResponse
} from '@chat-zernio/contracts';
import type { FastifyRequest } from 'fastify';
import { TenantConversationService } from './tenant-conversation.service';
import { TenantMessageService } from './tenant-message.service';

@Controller('v1/tenants/:tenantId/conversations')
export class ConversationsController {
  constructor(
    @Inject(TenantConversationService)
    private readonly tenantConversationService: TenantConversationService,
    @Inject(TenantMessageService) private readonly tenantMessageService: TenantMessageService
  ) {}

  @Get()
  async list(
    @Param('tenantId') tenantId: string,
    @Query() rawQuery: Record<string, unknown>,
    @Req() request: FastifyRequest
  ): Promise<ConversationListResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    const parsedQuery = conversationListQuerySchema.safeParse(rawQuery);
    if (!parsedTenantId.success || !parsedQuery.success) {
      throw new BadRequestException('La solicitud de conversaciones no es válida.');
    }
    return this.tenantConversationService.list(
      request.headers.authorization,
      parsedTenantId.data,
      parsedQuery.data
    );
  }

  @Get(':conversationId/messages')
  async listMessages(
    @Param('tenantId') tenantId: string,
    @Param('conversationId') conversationId: string,
    @Query() rawQuery: Record<string, unknown>,
    @Req() request: FastifyRequest
  ): Promise<ConversationMessageListResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    const parsedConversationId = tenantIdSchema.safeParse(conversationId);
    const parsedQuery = conversationMessageListQuerySchema.safeParse(rawQuery);
    if (!parsedTenantId.success || !parsedConversationId.success || !parsedQuery.success) {
      throw new BadRequestException('La solicitud de historial no es válida.');
    }
    return this.tenantMessageService.list(
      request.headers.authorization,
      parsedTenantId.data,
      parsedConversationId.data,
      parsedQuery.data
    );
  }

  @Post(':conversationId/messages')
  async createMessage(
    @Param('tenantId') tenantId: string,
    @Param('conversationId') conversationId: string,
    @Body() rawBody: unknown,
    @Req() request: FastifyRequest
  ): Promise<CreateOutboundMessageResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    const parsedConversationId = tenantIdSchema.safeParse(conversationId);
    const parsedBody = createOutboundMessageSchema.safeParse(rawBody);
    if (!parsedTenantId.success || !parsedConversationId.success || !parsedBody.success) {
      throw new BadRequestException('La solicitud de mensaje no es válida.');
    }
    return this.tenantMessageService.createOutbound(
      request.headers.authorization,
      parsedTenantId.data,
      parsedConversationId.data,
      parsedBody.data
    );
  }

  @Post(':conversationId/read')
  async markRead(
    @Param('tenantId') tenantId: string,
    @Param('conversationId') conversationId: string,
    @Body() rawBody: unknown,
    @Req() request: FastifyRequest
  ): Promise<MarkConversationReadResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    const parsedConversationId = tenantIdSchema.safeParse(conversationId);
    const parsedBody = markConversationReadSchema.safeParse(rawBody);
    if (!parsedTenantId.success || !parsedConversationId.success || !parsedBody.success) {
      throw new BadRequestException('La solicitud de lectura no es válida.');
    }
    return this.tenantConversationService.markRead(
      request.headers.authorization,
      parsedTenantId.data,
      parsedConversationId.data,
      parsedBody.data
    );
  }

  @Post(':conversationId/won')
  async markWon(
    @Param('tenantId') tenantId: string,
    @Param('conversationId') conversationId: string,
    @Body() rawBody: unknown,
    @Req() request: FastifyRequest
  ): Promise<ConversationWonResponse> {
    return this.tenantConversationService.markWon(
      request.headers.authorization,
      tenantId,
      conversationId,
      rawBody
    );
  }

  @Patch(':conversationId/status')
  async changeStatus(
    @Param('tenantId') tenantId: string,
    @Param('conversationId') conversationId: string,
    @Body() rawBody: unknown,
    @Req() request: FastifyRequest
  ): Promise<UpdateConversationStatusResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    const parsedConversationId = tenantIdSchema.safeParse(conversationId);
    const parsedBody = updateConversationStatusSchema.safeParse(rawBody);
    if (!parsedTenantId.success || !parsedConversationId.success || !parsedBody.success) {
      throw new BadRequestException('La solicitud de estado no es válida.');
    }
    return this.tenantConversationService.changeStatus(
      request.headers.authorization,
      parsedTenantId.data,
      parsedConversationId.data,
      parsedBody.data
    );
  }

  @Patch(':conversationId/assignment')
  async changeAssignment(
    @Param('tenantId') tenantId: string,
    @Param('conversationId') conversationId: string,
    @Body() rawBody: unknown,
    @Req() request: FastifyRequest
  ): Promise<UpdateConversationAssignmentResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    const parsedConversationId = tenantIdSchema.safeParse(conversationId);
    const parsedBody = updateConversationAssignmentSchema.safeParse(rawBody);
    if (!parsedTenantId.success || !parsedConversationId.success || !parsedBody.success) {
      throw new BadRequestException('La solicitud de asignación no es válida.');
    }
    return this.tenantConversationService.changeAssignment(
      request.headers.authorization,
      parsedTenantId.data,
      parsedConversationId.data,
      parsedBody.data
    );
  }

  @Patch(':conversationId/automation')
  async changeAutomation(
    @Param('tenantId') tenantId: string,
    @Param('conversationId') conversationId: string,
    @Body() rawBody: unknown,
    @Req() request: FastifyRequest
  ): Promise<UpdateConversationAutomationResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    const parsedConversationId = tenantIdSchema.safeParse(conversationId);
    const parsedBody = updateConversationAutomationSchema.safeParse(rawBody);
    if (!parsedTenantId.success || !parsedConversationId.success || !parsedBody.success) {
      throw new BadRequestException('La solicitud de bot no es valida.');
    }
    return this.tenantConversationService.changeAutomation(
      request.headers.authorization,
      parsedTenantId.data,
      parsedConversationId.data,
      parsedBody.data
    );
  }
}
