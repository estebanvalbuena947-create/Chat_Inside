import { Controller, Get, Headers, Inject, Param } from '@nestjs/common';
import { ToolBranchesService } from './tool-branches.service';

/** Multimedia de una sede para el bot. Se autentica con la credencial de maquina. */
@Controller('v1/tools/branches')
export class ToolBranchesController {
  constructor(@Inject(ToolBranchesService) private readonly service: ToolBranchesService) {}

  @Get(':slug/media')
  async listMedia(
    @Param('slug') slug: string,
    @Headers('authorization') authorization: string | undefined
  ): Promise<unknown> {
    return this.service.listMedia(authorization, slug);
  }
}
