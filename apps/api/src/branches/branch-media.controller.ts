import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { BranchMediaService } from './branch-media.service';

/**
 * Multimedia de una sede, administrada desde la interfaz.
 *
 * La forma sigue a la multimedia de las conversaciones: el espacio va en el camino y la sesion es
 * de persona. La sede tambien va en el camino, porque es parte de lo que se esta administrando.
 *
 * Devuelve 201: se ha creado un registro. Si el mismo archivo se importa otra vez, el servicio
 * actualiza la fila en lugar de crear otra, y la respuesta sigue siendo un registro valido.
 */
@Controller('v1/tenants/:tenantId/branches/:branchSlug/media')
export class BranchMediaController {
  constructor(@Inject(BranchMediaService) private readonly service: BranchMediaService) {}

  /** El material de la sede, con enlaces firmados para poder mostrarlo. */
  @Get()
  async listar(
    @Param('tenantId') tenantId: string,
    @Param('branchSlug') branchSlug: string,
    @Headers('authorization') authorization: string | undefined
  ): Promise<unknown> {
    return this.service.list(authorization, tenantId, branchSlug);
  }

  /** Importa un archivo desde una direccion publica al material de la sede. */
  @Post()
  @HttpCode(201)
  async importar(
    @Param('tenantId') tenantId: string,
    @Param('branchSlug') branchSlug: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined
  ): Promise<unknown> {
    // La sede viene en el camino; se añade al cuerpo para que el servicio la valide con el resto.
    const cuerpo = (body ?? {}) as Record<string, unknown>;
    return this.service.importFromUrl(authorization, tenantId, { ...cuerpo, branchSlug });
  }
}
