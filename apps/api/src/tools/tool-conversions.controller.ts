import { Controller, Inject, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ToolConversionsService } from './tool-conversions.service';

/** Conversiones ganadas para Meta, con credencial de maquina. */
@Controller('v1/tools')
export class ToolConversionsController {
  constructor(@Inject(ToolConversionsService) private readonly service: ToolConversionsService) {}

  @Post('conversions')
  async enqueue(@Req() request: FastifyRequest): Promise<unknown> {
    return this.service.enqueue(request.headers.authorization, request.body);
  }
}
