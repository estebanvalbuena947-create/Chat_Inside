import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Req
} from '@nestjs/common';
import {
  createInternalLabelSchema,
  deleteInternalLabelSchema,
  tenantIdSchema,
  updateInternalLabelSchema,
  type InternalLabelListResponse,
  type InternalLabelMutationResponse
} from '@chat-zernio/contracts';
import type { FastifyRequest } from 'fastify';
import { InternalLabelService } from './internal-label.service';

@Controller('v1/tenants/:tenantId')
export class InternalLabelsController {
  constructor(@Inject(InternalLabelService) private readonly service: InternalLabelService) {}

  @Get('labels')
  list(
    @Param('tenantId') tenantId: string,
    @Req() request: FastifyRequest
  ): Promise<InternalLabelListResponse> {
    return this.service.list(request.headers.authorization, this.parseId(tenantId));
  }

  @Post('labels')
  create(
    @Param('tenantId') tenantId: string,
    @Body() rawBody: unknown,
    @Req() request: FastifyRequest
  ): Promise<InternalLabelMutationResponse> {
    const command = createInternalLabelSchema.safeParse(rawBody);
    if (!command.success) throw new BadRequestException('La etiqueta no es válida.');
    return this.service.create(request.headers.authorization, this.parseId(tenantId), command.data);
  }

  @Patch('labels/:labelId')
  update(
    @Param('tenantId') tenantId: string,
    @Param('labelId') labelId: string,
    @Body() rawBody: unknown,
    @Req() request: FastifyRequest
  ): Promise<InternalLabelMutationResponse> {
    const command = updateInternalLabelSchema.safeParse(rawBody);
    if (!command.success) throw new BadRequestException('La etiqueta no es válida.');
    return this.service.update(
      request.headers.authorization,
      this.parseId(tenantId),
      this.parseId(labelId),
      command.data
    );
  }

  @Delete('labels/:labelId')
  remove(
    @Param('tenantId') tenantId: string,
    @Param('labelId') labelId: string,
    @Body() rawBody: unknown,
    @Req() request: FastifyRequest
  ): Promise<InternalLabelMutationResponse> {
    const command = deleteInternalLabelSchema.safeParse(rawBody);
    if (!command.success) throw new BadRequestException('La eliminación de etiqueta no es válida.');
    return this.service.remove(
      request.headers.authorization,
      this.parseId(tenantId),
      this.parseId(labelId),
      command.data
    );
  }

  @Get('conversations/:conversationId/labels')
  listForConversation(
    @Param('tenantId') tenantId: string,
    @Param('conversationId') conversationId: string,
    @Req() request: FastifyRequest
  ): Promise<InternalLabelListResponse> {
    return this.service.listForConversation(
      request.headers.authorization,
      this.parseId(tenantId),
      this.parseId(conversationId)
    );
  }

  @Put('conversations/:conversationId/labels/:labelId')
  assign(
    @Param('tenantId') tenantId: string,
    @Param('conversationId') conversationId: string,
    @Param('labelId') labelId: string,
    @Req() request: FastifyRequest
  ): Promise<InternalLabelListResponse> {
    return this.service.assign(
      request.headers.authorization,
      this.parseId(tenantId),
      this.parseId(conversationId),
      this.parseId(labelId)
    );
  }

  @Delete('conversations/:conversationId/labels/:labelId')
  unassign(
    @Param('tenantId') tenantId: string,
    @Param('conversationId') conversationId: string,
    @Param('labelId') labelId: string,
    @Req() request: FastifyRequest
  ): Promise<InternalLabelListResponse> {
    return this.service.unassign(
      request.headers.authorization,
      this.parseId(tenantId),
      this.parseId(conversationId),
      this.parseId(labelId)
    );
  }

  private parseId(value: string): string {
    const parsed = tenantIdSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException('El identificador no es válido.');
    return parsed.data;
  }
}
