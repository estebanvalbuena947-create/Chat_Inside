import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UnprocessableEntityException
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
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

  /**
   * Cambia el titulo o el orden de un archivo ya cargado.
   *
   * El titulo es por donde el bot pide el material, asi que corregirlo no puede costar volver a subir
   * el archivo.
   */
  @Patch(':mediaId')
  async actualizar(
    @Param('tenantId') tenantId: string,
    @Param('branchSlug') branchSlug: string,
    @Param('mediaId') mediaId: string,
    @Body() body: unknown,
    @Headers('authorization') authorization: string | undefined
  ): Promise<unknown> {
    return this.service.update(authorization, tenantId, branchSlug, mediaId, body);
  }

  /** Quita un archivo del material de la sede. */
  @Delete(':mediaId')
  async quitar(
    @Param('tenantId') tenantId: string,
    @Param('branchSlug') branchSlug: string,
    @Param('mediaId') mediaId: string,
    @Headers('authorization') authorization: string | undefined
  ): Promise<unknown> {
    return this.service.remove(authorization, tenantId, branchSlug, mediaId);
  }

  /** Sube un archivo elegido por el administrador; la API reconoce su tipo por los bytes. */
  @Post('upload')
  @HttpCode(201)
  async subir(
    @Param('tenantId') tenantId: string,
    @Param('branchSlug') branchSlug: string,
    @Req() request: FastifyRequest,
    @Headers('authorization') authorization: string | undefined
  ): Promise<unknown> {
    const upload = await request.file();
    if (!upload) throw new UnprocessableEntityException('Hace falta un archivo.');

    const titleField = upload.fields.title;
    const firstTitleField = Array.isArray(titleField) ? titleField[0] : titleField;
    const title = firstTitleField && 'value' in firstTitleField ? firstTitleField.value : undefined;
    return this.service.uploadFile(authorization, tenantId, {
      branchSlug,
      bytes: await upload.toBuffer(),
      title: typeof title === 'string' ? title : undefined
    });
  }
}
