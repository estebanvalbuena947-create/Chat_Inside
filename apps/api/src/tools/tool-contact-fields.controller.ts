import { Controller, Get, Headers, Inject, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ToolContactFieldsService } from './tool-contact-fields.service';

/** Campos por contacto para el bot, con credencial de maquina. */
@Controller('v1/tools/contact-fields')
export class ToolContactFieldsController {
  constructor(
    @Inject(ToolContactFieldsService) private readonly service: ToolContactFieldsService
  ) {}

  @Post()
  async write(@Req() request: FastifyRequest): Promise<unknown> {
    return this.service.write(request.headers.authorization, request.body);
  }

  @Get()
  async read(
    @Query('contactId') contactId: string | undefined,
    @Headers('authorization') authorization: string | undefined
  ): Promise<unknown> {
    return this.service.read(authorization, contactId ?? '');
  }
}
