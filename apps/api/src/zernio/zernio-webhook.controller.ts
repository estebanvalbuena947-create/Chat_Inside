import {
  BadRequestException,
  Controller,
  Headers,
  Inject,
  Post,
  RawBodyRequest,
  Req
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ZernioWebhookService } from './zernio-webhook.service';

@Controller('v1/webhooks/zernio')
export class ZernioWebhookController {
  constructor(
    @Inject(ZernioWebhookService) private readonly zernioWebhookService: ZernioWebhookService
  ) {}

  @Post()
  receive(
    @Req() request: RawBodyRequest<FastifyRequest>,
    @Headers('x-zernio-signature') signature: string | undefined
  ): Promise<{ duplicate: boolean }> {
    if (!Buffer.isBuffer(request.rawBody)) {
      throw new BadRequestException('El cuerpo del webhook debe ser binario.');
    }

    return this.zernioWebhookService.receive(request.rawBody, signature);
  }
}
