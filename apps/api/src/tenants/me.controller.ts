import { BadRequestException, Body, Controller, Get, Inject, Patch, Req } from '@nestjs/common';
import { updateOwnProfileSchema, type OwnProfileResponse } from '@chat-zernio/contracts';
import type { FastifyRequest } from 'fastify';
import { TenantAccessService } from './tenant-access.service';

@Controller('v1/me')
export class MeController {
  constructor(
    @Inject(TenantAccessService) private readonly tenantAccessService: TenantAccessService
  ) {}

  @Get()
  get(@Req() request: FastifyRequest): Promise<OwnProfileResponse> {
    return this.tenantAccessService.getOwnProfile(request.headers.authorization);
  }

  @Patch()
  update(@Body() rawBody: unknown, @Req() request: FastifyRequest): Promise<OwnProfileResponse> {
    const parsedBody = updateOwnProfileSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      throw new BadRequestException('La solicitud de tu perfil no es válida.');
    }
    return this.tenantAccessService.updateOwnProfile(
      request.headers.authorization,
      parsedBody.data
    );
  }
}
