import { Controller, Inject, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AdvisorPresenceService, type AdvisorPresenceResponse } from './advisor-presence.service';

/** Pulso de presencia de la bandeja: es lo que hace a una asesora elegible para la rotacion. */
@Controller('v1/tenants/:tenantId/presence')
export class AdvisorPresenceController {
  constructor(@Inject(AdvisorPresenceService) private readonly service: AdvisorPresenceService) {}

  @Post()
  heartbeat(
    @Param('tenantId') tenantId: string,
    @Req() request: FastifyRequest
  ): Promise<AdvisorPresenceResponse> {
    return this.service.heartbeat(request.headers.authorization, tenantId);
  }
}
