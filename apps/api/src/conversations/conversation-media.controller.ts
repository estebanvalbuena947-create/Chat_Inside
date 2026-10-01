import { BadRequestException, Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import {
  mediaListQuerySchema,
  tenantIdSchema,
  type MediaListResponse
} from '@chat-zernio/contracts';
import type { FastifyRequest } from 'fastify';
import { ConversationMediaService } from './conversation-media.service';

@Controller('v1/tenants/:tenantId/media')
export class ConversationMediaController {
  constructor(
    @Inject(ConversationMediaService)
    private readonly conversationMediaService: ConversationMediaService
  ) {}

  @Get()
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
}
