import { Controller, Get, Headers, Inject, Param, Query } from '@nestjs/common';
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

  @Get(':slug/services')
  async listServices(
    @Param('slug') slug: string,
    @Headers('authorization') authorization: string | undefined
  ): Promise<unknown> {
    return this.service.listServices(authorization, slug);
  }
}
