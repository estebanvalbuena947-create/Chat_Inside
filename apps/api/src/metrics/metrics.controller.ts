import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { metricsSummaryQuerySchema, type MetricsSummary } from '@chat-zernio/contracts';
import { MetricsService } from './metrics.service';

/** Resumen de actividad para el panel. Solo lectura, con el mismo permiso que ver la bandeja. */
@Controller('v1/tenants/:tenantId/metrics')
export class MetricsController {
  constructor(@Inject(MetricsService) private readonly service: MetricsService) {}

  @Get('summary')
  async summary(
    @Param('tenantId') tenantId: string,
    @Query() rawQuery: unknown,
    @Req() request: FastifyRequest
  ): Promise<MetricsSummary> {
    const query = metricsSummaryQuerySchema.parse(rawQuery);
    return this.service.summary(request.headers.authorization, tenantId, query.days);
  }
}
