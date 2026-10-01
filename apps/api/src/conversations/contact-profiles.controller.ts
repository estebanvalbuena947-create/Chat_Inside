import { BadRequestException, Controller, Get, Inject, Param, Req } from '@nestjs/common';
import { tenantIdSchema, type ContactAvatarResponse } from '@chat-zernio/contracts';
import type { FastifyRequest } from 'fastify';
import { ContactProfileService } from './contact-profile.service';

@Controller('v1/tenants/:tenantId/contacts')
export class ContactProfilesController {
  constructor(@Inject(ContactProfileService) private readonly service: ContactProfileService) {}

  @Get(':contactId/avatar')
  createAvatarUrl(
    @Param('tenantId') tenantId: string,
    @Param('contactId') contactId: string,
    @Req() request: FastifyRequest
  ): Promise<ContactAvatarResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    const parsedContactId = tenantIdSchema.safeParse(contactId);
    if (!parsedTenantId.success || !parsedContactId.success) {
      throw new BadRequestException('La solicitud de avatar no es válida.');
    }
    return this.service.createAvatarUrl(
      request.headers.authorization,
      parsedTenantId.data,
      parsedContactId.data
    );
  }
}
