import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  PayloadTooLargeException,
  Post,
  Query,
  Req,
  UnprocessableEntityException
} from '@nestjs/common';
import {
  maxOutboundMediaLabel,
  mediaListQuerySchema,
  tenantIdSchema,
  type ConversationMediaUploadResponse,
  type MediaListResponse
} from '@chat-zernio/contracts';
import type { FastifyRequest } from 'fastify';
import { ConversationMediaService } from './conversation-media.service';

/**
 * El archivo de una conversacion: la galeria y la subida.
 *
 * El espacio va en el camino y la sesion es de persona. La subida lleva ademas la conversacion,
 * porque el archivo pertenece a una conversacion concreta y el aislamiento entre espacios no puede
 * depender de la interfaz.
 */
@Controller('v1/tenants/:tenantId')
export class ConversationMediaController {
  constructor(
    @Inject(ConversationMediaService)
    private readonly conversationMediaService: ConversationMediaService
  ) {}

  @Get('media')
  list(
    @Param('tenantId') tenantId: string,
    @Query() rawQuery: unknown,
    @Req() request: FastifyRequest
  ): Promise<MediaListResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    const parsedQuery = mediaListQuerySchema.safeParse(rawQuery);
    if (!parsedTenantId.success || !parsedQuery.success) {
      throw new BadRequestException('La solicitud de multimedia no es válida.');
    }
    return this.conversationMediaService.list(
      request.headers.authorization,
      parsedTenantId.data,
      parsedQuery.data
    );
  }

  /**
   * Sube el archivo elegido por quien atiende. La API reconoce su tipo por los bytes.
   *
   * Un archivo que supera el limite del lector no es un fallo del servidor: el limite lo impone
   * `main.ts` y el cliente tiene que poder distinguirlo. El servicio mide ademas antes de escribir,
   * asi que un archivo grande nunca llega al almacen.
   */
  @Post('conversations/:conversationId/media')
  @HttpCode(201)
  async subir(
    @Param('tenantId') tenantId: string,
    @Param('conversationId') conversationId: string,
    @Req() request: FastifyRequest
  ): Promise<ConversationMediaUploadResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    const parsedConversationId = tenantIdSchema.safeParse(conversationId);
    if (!parsedTenantId.success || !parsedConversationId.success) {
      throw new BadRequestException('La solicitud de archivo no es válida.');
    }

    let upload: Awaited<ReturnType<FastifyRequest['file']>>;
    try {
      upload = await request.file();
    } catch (error) {
      throw translateReaderError(error);
    }
    if (!upload) throw new UnprocessableEntityException('Hace falta un archivo.');

    let bytes: Buffer;
    try {
      bytes = await upload.toBuffer();
    } catch (error) {
      throw translateReaderError(error);
    }

    return this.conversationMediaService.upload(
      request.headers.authorization,
      parsedTenantId.data,
      parsedConversationId.data,
      bytes
    );
  }
}

/**
 * El lector multipart señala con 413 un archivo que supera su limite, y con eso mismo marca el
 * limite de numero de archivos. Nest solo traduce sus propias excepciones, asi que aqui se conserva
 * el 413 en vez de convertirlo en un 500 que el cliente no puede interpretar. Cualquier otro fallo
 * del lector se deja pasar tal cual: no se disfraza de limite lo que no lo es.
 */
function translateReaderError(error: unknown): never {
  const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
  const code = (error as { code?: unknown } | null)?.code;
  if (statusCode === 413 || code === 'FST_REQ_FILE_TOO_LARGE') {
    throw new PayloadTooLargeException(`El archivo supera el límite de ${maxOutboundMediaLabel}.`);
  }
  throw error;
}
