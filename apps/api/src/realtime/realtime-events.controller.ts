import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Req,
  Res
} from '@nestjs/common';
import { tenantIdSchema } from '@chat-zernio/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { TenantRealtimeService } from './tenant-realtime.service';

type RealtimeEvent = {
  cursor: string;
  event: 'inbox.changed' | 'inbox.ready' | 'inbox.resync';
};

export function toSseFrame(event: RealtimeEvent): string {
  return `id: ${event.cursor}\nevent: ${event.event}\ndata: {"cursor":"${event.cursor}"}\n\n`;
}

@Controller('v1/tenants/:tenantId/events')
export class RealtimeEventsController {
  constructor(
    @Inject(TenantRealtimeService) private readonly tenantRealtimeService: TenantRealtimeService
  ) {}

  @Get()
  async stream(
    @Param('tenantId') tenantId: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    if (!parsedTenantId.success) {
      throw new BadRequestException('La solicitud de eventos no es válida.');
    }

    await this.tenantRealtimeService.authorize(authorization, parsedTenantId.data);
    let cursor = await this.tenantRealtimeService.currentCursor(parsedTenantId.data);
    const response = reply.raw;
    reply.hijack();
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.write(
      toSseFrame({
        cursor,
        event: lastEventId && lastEventId !== cursor ? 'inbox.resync' : 'inbox.ready'
      })
    );

    let isPolling = false;
    let pollsSinceKeepalive = 0;
    const interval = setInterval(() => {
      if (isPolling) return;
      isPolling = true;
      void this.tenantRealtimeService
        .currentCursor(parsedTenantId.data)
        .then((nextCursor) => {
          if (nextCursor !== cursor) {
            cursor = nextCursor;
            pollsSinceKeepalive = 0;
            response.write(toSseFrame({ cursor, event: 'inbox.changed' }));
          } else if (++pollsSinceKeepalive >= 15) {
            pollsSinceKeepalive = 0;
            response.write(': keepalive\n\n');
          }
        })
        .catch(() => {
          response.write(': keepalive\n\n');
        })
        .finally(() => {
          isPolling = false;
        });
    }, 2_000);

    request.raw.once('close', () => clearInterval(interval));
  }
}
