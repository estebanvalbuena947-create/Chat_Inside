import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import { replyToGoogleReviewSchema } from '@chat-zernio/contracts';
import type { FastifyRequest } from 'fastify';
import { BadRequestException } from '@nestjs/common';
import { GoogleReviewsService } from './google-reviews.service';

/**
 * La bandeja de resenas: lo que ve la persona que responde.
 *
 * Se autentica con la sesion y comprueba la membresia, como el resto de la bandeja. Solo entran las
 * resenas que siguen sin respuesta: las que el bot ya contesto no necesitan a nadie.
 */
@Controller('v1/tenants/:tenantId/reviews')
export class GoogleReviewsController {
  constructor(@Inject(GoogleReviewsService) private readonly service: GoogleReviewsService) {}

  @Get()
  async list(
    @Param('tenantId') tenantId: string,
    @Req() request: FastifyRequest
  ): Promise<unknown> {
    return this.service.listForInbox(request.headers.authorization, tenantId);
  }

  @Post(':reviewId/reply')
  async reply(
    @Param('tenantId') tenantId: string,
    @Param('reviewId') reviewId: string,
    @Body() rawBody: unknown,
    @Req() request: FastifyRequest
  ): Promise<unknown> {
    const parsed = replyToGoogleReviewSchema.safeParse(rawBody);
    if (!parsed.success) throw new BadRequestException('La respuesta no es válida.');
    return this.service.replyFromAdvisor(
      request.headers.authorization,
      tenantId,
      reviewId,
      parsed.data
    );
  }
}
