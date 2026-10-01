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
  inviteTenantMemberSchema,
  tenantIdSchema,
  updateTenantMemberRoleSchema,
  type InviteTenantMemberResponse,
  type RemoveTenantMemberResponse,
  type TenantListResponse,
  type TenantMemberListResponse,
  type UpdateTenantMemberRoleResponse
} from '@chat-zernio/contracts';
import type { FastifyRequest } from 'fastify';
import { TenantAccessService } from './tenant-access.service';

@Controller('v1/tenants')
export class TenantsController {
  constructor(
    @Inject(TenantAccessService) private readonly tenantAccessService: TenantAccessService
  ) {}

  @Get()
  list(@Req() request: FastifyRequest): Promise<TenantListResponse> {
    return this.tenantAccessService.listAccessibleTenants(request.headers.authorization);
  }

  @Get(':tenantId/members')
  listMembers(
    @Param('tenantId') tenantId: string,
    @Req() request: FastifyRequest
  ): Promise<TenantMemberListResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    if (!parsedTenantId.success) {
      throw new BadRequestException('La solicitud de integrantes no es válida.');
    }
    return this.tenantAccessService.listTenantMembers(
      request.headers.authorization,
      parsedTenantId.data
    );
  }

  @Post(':tenantId/invitations')
  async invite(
    @Param('tenantId') tenantId: string,
    @Body() rawBody: unknown,
    @Req() request: FastifyRequest
  ): Promise<InviteTenantMemberResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    const parsedBody = inviteTenantMemberSchema.safeParse(rawBody);
    if (!parsedTenantId.success || !parsedBody.success) {
      throw new BadRequestException('La solicitud de invitación no es válida.');
    }
    return this.tenantAccessService.inviteMember(
      request.headers.authorization,
      parsedTenantId.data,
      parsedBody.data
    );
  }

  @Patch(':tenantId/members/:userId')
  async updateRole(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @Body() rawBody: unknown,
    @Req() request: FastifyRequest
  ): Promise<UpdateTenantMemberRoleResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    const parsedUserId = tenantIdSchema.safeParse(userId);
    const parsedBody = updateTenantMemberRoleSchema.safeParse(rawBody);
    if (!parsedTenantId.success || !parsedUserId.success || !parsedBody.success) {
      throw new BadRequestException('La solicitud de rol no es válida.');
    }
    return this.tenantAccessService.updateMemberRole(
      request.headers.authorization,
      parsedTenantId.data,
      parsedUserId.data,
      parsedBody.data
    );
  }

  @Delete(':tenantId/members/:userId')
  remove(
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
    @Req() request: FastifyRequest
  ): Promise<RemoveTenantMemberResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    const parsedUserId = tenantIdSchema.safeParse(userId);
    if (!parsedTenantId.success || !parsedUserId.success) {
      throw new BadRequestException('La solicitud de retiro no es válida.');
    }
    return this.tenantAccessService.removeMember(
      request.headers.authorization,
      parsedTenantId.data,
      parsedUserId.data
    );
  }
}
