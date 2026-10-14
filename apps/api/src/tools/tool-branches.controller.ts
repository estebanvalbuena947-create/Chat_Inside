import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from '@nestjs/common';
import { ToolBranchesService } from './tool-branches.service';

/** Multimedia de una sede para el bot. Se autentica con la credencial de maquina. */
@Controller('v1/tools/branches')
export class ToolBranchesController {
  constructor(@Inject(ToolBranchesService) private readonly service: ToolBranchesService) {}

  /** Las sedes activas: lo que el bot necesita para poder ofrecer una. */
  @Get()
  async listBranches(
    @Headers('authorization') authorization: string | undefined
  ): Promise<unknown> {
    return this.service.listBranches(authorization);
  }

  @Get(':slug/media')
  async listMedia(
    @Param('slug') slug: string,
    @Query('channel') channel: string | undefined,
    @Headers('authorization') authorization: string | undefined
  ): Promise<unknown> {
    return this.service.listMedia(authorization, slug, channel);
  }

  /** Comparte, en su orden configurado, todo el material de una sede con una conversación. */
  @Post(':slug/media/send')
  async sendMedia(
    @Param('slug') slug: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown
  ): Promise<unknown> {
    return this.service.sendMedia(authorization, slug, body);
  }

  @Get(':slug/services')
  async listServices(
    @Param('slug') slug: string,
    @Headers('authorization') authorization: string | undefined
  ): Promise<unknown> {
    return this.service.listServices(authorization, slug);
  }
}
