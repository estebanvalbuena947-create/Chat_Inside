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
import { TenantRealtimeService, type RealtimeEvent } from './tenant-realtime.service';

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
    @Headers('last-event-id') _lastEventId: string | undefined,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    if (!parsedTenantId.success) {
      throw new BadRequestException('La solicitud de eventos no es válida.');
    }

    await this.tenantRealtimeService.authorize(authorization, parsedTenantId.data);
    const response = reply.raw;
    reply.hijack();
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.write('retry: 5000\n\n');
    let closed = false;
    // Puede cerrar durante el callback inicial, antes de devolver la suscripción.
    const subscription: { unsubscribe?: () => void } = {};
    const cleanup = () => {
      closed = true;
      clearInterval(keepalive);
      subscription.unsubscribe?.();
      request.raw.removeListener('aborted', finish);
      response.removeListener('close', cleanup);
    };
    const finish = () => {
      cleanup();
      if (!response.writableEnded) response.end();
    };
    // Mantiene el transporte abierto sin ninguna lectura de base de datos.
    const keepalive = setInterval(() => {
      if (!response.write(': keepalive\n\n')) finish();
    }, 15_000);
    response.once('close', cleanup);
    request.raw.once('aborted', finish);
    subscription.unsubscribe = this.tenantRealtimeService.subscribe(
      parsedTenantId.data,
      (event) => {
        if (closed) return;
        if (!response.write(toSseFrame(event)) || event.event === 'inbox.offline') finish();
      }
    );
    if (closed || response.destroyed || request.raw.aborted) finish();
  }
}
