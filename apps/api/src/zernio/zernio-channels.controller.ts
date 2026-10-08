import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req
} from '@nestjs/common';
import {
  attachZernioChannelSchema,
  renameZernioChannelSchema,
  startZernioChannelConnectionSchema,
  tenantIdSchema,
  type AttachZernioChannelResponse,
  type DisconnectZernioChannelResponse,
  type RenameZernioChannelResponse,
  type StartZernioChannelConnectionResponse,
  type WhatsappTemplateListResponse,
  type ZernioChannelListResponse
} from '@chat-zernio/contracts';
import type { FastifyRequest } from 'fastify';
import { ZernioChannelService } from './zernio-channel.service';

@Controller('v1/tenants/:tenantId/channels')
export class ZernioChannelsController {
  constructor(
    @Inject(ZernioChannelService) private readonly zernioChannelService: ZernioChannelService
  ) {}

  @Get()
  async list(
    @Param('tenantId') tenantId: string,
    @Req() request: FastifyRequest
  ): Promise<ZernioChannelListResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    if (!parsedTenantId.success) throw new BadRequestException('El tenant no es válido.');
    return this.zernioChannelService.list(request.headers.authorization, parsedTenantId.data);
  }

  /**
   * Plantillas aprobadas de WhatsApp de este espacio.
   *
   * Su propia ruta, bajo `whatsapp/`, para que quede claro que no son los canales: son el catalogo
   * de una cuenta de WhatsApp concreta.
   */
  @Get('whatsapp/templates')
  async whatsappTemplates(
    @Param('tenantId') tenantId: string,
    @Req() request: FastifyRequest
  ): Promise<WhatsappTemplateListResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    if (!parsedTenantId.success) throw new BadRequestException('El tenant no es válido.');
    return this.zernioChannelService.listWhatsappTemplates(
      request.headers.authorization,
      parsedTenantId.data
    );
  }

  @Post('connect')
  async connect(
    @Param('tenantId') tenantId: string,
    @Body() rawBody: unknown,
    @Req() request: FastifyRequest
  ): Promise<StartZernioChannelConnectionResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    const parsedBody = startZernioChannelConnectionSchema.safeParse(rawBody);
    if (!parsedTenantId.success || !parsedBody.success) {
      throw new BadRequestException('La solicitud para conectar el canal no es válida.');
    }
    return this.zernioChannelService.startConnection(
      request.headers.authorization,
      parsedTenantId.data,
      parsedBody.data.platform
    );
  }

  @Post('attach')
  async attach(
    @Param('tenantId') tenantId: string,

    @Body() rawBody: unknown,

    @Req() request: FastifyRequest
  ): Promise<AttachZernioChannelResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);

    const parsedBody = attachZernioChannelSchema.safeParse(rawBody);

    if (!parsedTenantId.success || !parsedBody.success) {
      throw new BadRequestException('La solicitud para registrar el canal no es válida.');
    }

    return this.zernioChannelService.attachAccount(
      request.headers.authorization,

      parsedTenantId.data,

      parsedBody.data.accountId
    );
  }

  @Patch(':channelId')
  async rename(
    @Param('tenantId') tenantId: string,
    @Param('channelId') channelId: string,
    @Body() rawBody: unknown,
    @Req() request: FastifyRequest
  ): Promise<RenameZernioChannelResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    const parsedChannelId = tenantIdSchema.safeParse(channelId);
    const parsedBody = renameZernioChannelSchema.safeParse(rawBody);
    if (!parsedTenantId.success || !parsedChannelId.success || !parsedBody.success) {
      throw new BadRequestException('La solicitud para nombrar el canal no es válida.');
    }
    return this.zernioChannelService.rename(
      request.headers.authorization,
      parsedTenantId.data,
      parsedChannelId.data,
      parsedBody.data
    );
  }

  /**
   * Retira un canal: lo desconecta en el proveedor y lo saca de la operacion.
   *
   * `DELETE` porque el efecto es quitar el canal de circulacion, pero la fila se conserva: la
   * historia de la bandeja la referencia y borrarla la romperia. Solo un administrador.
   */
  @Delete(':channelId')
  async disconnect(
    @Param('tenantId') tenantId: string,
    @Param('channelId') channelId: string,
    @Req() request: FastifyRequest
  ): Promise<DisconnectZernioChannelResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    const parsedChannelId = tenantIdSchema.safeParse(channelId);
    if (!parsedTenantId.success || !parsedChannelId.success) {
      throw new BadRequestException('La solicitud para retirar el canal no es válida.');
    }
    return this.zernioChannelService.disconnect(
      request.headers.authorization,
      parsedTenantId.data,
      parsedChannelId.data
    );
  }

  /** Vuelve a abrir la autorizacion del proveedor para un canal retirado. Solo un administrador. */
  @Post(':channelId/reconnect')
  async reconnect(
    @Param('tenantId') tenantId: string,
    @Param('channelId') channelId: string,
    @Req() request: FastifyRequest
  ): Promise<StartZernioChannelConnectionResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    const parsedChannelId = tenantIdSchema.safeParse(channelId);
    if (!parsedTenantId.success || !parsedChannelId.success) {
      throw new BadRequestException('La solicitud para reconectar el canal no es válida.');
    }
    return this.zernioChannelService.reconnect(
      request.headers.authorization,
      parsedTenantId.data,
      parsedChannelId.data
    );
  }
}
