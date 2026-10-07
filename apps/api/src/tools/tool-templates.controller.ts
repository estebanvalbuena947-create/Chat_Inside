import { Controller, Get, Headers, Inject, Param, Query } from '@nestjs/common';
import { ToolTemplatesService } from './tool-templates.service';

/** Plantillas de mensaje para el bot, con credencial de maquina. */
@Controller('v1/tools/templates')
export class ToolTemplatesController {
  constructor(@Inject(ToolTemplatesService) private readonly service: ToolTemplatesService) {}

  @Get()
  async list(
    @Query('channel') channel: string | undefined,
    @Headers('authorization') authorization: string | undefined
  ): Promise<unknown> {
    return this.service.list(authorization, channel);
  }

  @Get(':code')
  async read(
    @Param('code') code: string,
    @Headers('authorization') authorization: string | undefined
  ): Promise<unknown> {
    return this.service.read(authorization, code);
  }
}
