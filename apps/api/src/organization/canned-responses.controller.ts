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
  Req
} from '@nestjs/common';
import {
  createCannedResponseSchema,
  deleteCannedResponseSchema,
  tenantIdSchema,
  updateCannedResponseSchema,
  type CannedResponseListResponse,
  type CannedResponseMutationResponse
} from '@chat-zernio/contracts';
import type { FastifyRequest } from 'fastify';
import { CannedResponseService } from './canned-response.service';

@Controller('v1/tenants/:tenantId/canned-responses')
export class CannedResponsesController {
  constructor(@Inject(CannedResponseService) private readonly service: CannedResponseService) {}

  @Get()
  async list(
    @Param('tenantId') tenantId: string,
    @Req() request: FastifyRequest
  ): Promise<CannedResponseListResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    if (!parsedTenantId.success) throw new BadRequestException('El tenant no es válido.');
    return this.service.list(request.headers.authorization, parsedTenantId.data);
  }

  @Post()
  async create(
    @Param('tenantId') tenantId: string,
    @Body() rawBody: unknown,
    @Req() request: FastifyRequest
  ): Promise<CannedResponseMutationResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    const parsedBody = createCannedResponseSchema.safeParse(rawBody);
    if (!parsedTenantId.success || !parsedBody.success) {
      throw new BadRequestException('La respuesta rápida no es válida.');
    }
    return this.service.create(request.headers.authorization, parsedTenantId.data, parsedBody.data);
  }

  @Patch(':responseId')
  async update(
    @Param('tenantId') tenantId: string,
    @Param('responseId') responseId: string,
    @Body() rawBody: unknown,
    @Req() request: FastifyRequest
  ): Promise<CannedResponseMutationResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    const parsedResponseId = tenantIdSchema.safeParse(responseId);
    const parsedBody = updateCannedResponseSchema.safeParse(rawBody);
    if (!parsedTenantId.success || !parsedResponseId.success || !parsedBody.success) {
      throw new BadRequestException('La respuesta rápida no es válida.');
    }
    return this.service.update(
      request.headers.authorization,
      parsedTenantId.data,
      parsedResponseId.data,
      parsedBody.data
    );
  }

  @Delete(':responseId')
  async remove(
    @Param('tenantId') tenantId: string,
    @Param('responseId') responseId: string,
    @Body() rawBody: unknown,
    @Req() request: FastifyRequest
  ): Promise<CannedResponseMutationResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    const parsedResponseId = tenantIdSchema.safeParse(responseId);
    const parsedBody = deleteCannedResponseSchema.safeParse(rawBody);
    if (!parsedTenantId.success || !parsedResponseId.success || !parsedBody.success) {
      throw new BadRequestException('La solicitud para eliminar no es válida.');
    }
    return this.service.remove(
      request.headers.authorization,
      parsedTenantId.data,
      parsedResponseId.data,
      parsedBody.data
    );
  }
}
