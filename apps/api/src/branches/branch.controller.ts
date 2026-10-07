import { Controller, Get, Headers, Inject, Param } from '@nestjs/common';
import { BranchService } from './branch.service';

/**
 * Las sedes del espacio, para la interfaz.
 *
 * La ruta cuelga del espacio, como las demas de administracion, y la sesion es de persona. El
 * listado que usa el bot vive en `/v1/tools/branches` y va con credencial de maquina.
 */
@Controller('v1/tenants/:tenantId/branches')
export class BranchController {
  constructor(@Inject(BranchService) private readonly service: BranchService) {}

  /** Las sedes activas, para poder elegir una. */
  @Get()
  async listar(
    @Param('tenantId') tenantId: string,
    @Headers('authorization') authorization: string | undefined
  ): Promise<unknown> {
    return this.service.list(authorization, tenantId);
  }
}
