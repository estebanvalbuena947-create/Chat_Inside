import { BadRequestException, Controller, Get, Inject, Param, Req } from '@nestjs/common';
import { tenantIdSchema, type ReservationsBoardResponse } from '@chat-zernio/contracts';
import type { FastifyRequest } from 'fastify';
import { ReservationsService } from './reservations.service';

/**
 * Tablero de reservas del espacio.
 *
 * Una sola lectura por ahora: el tablero completo (pre-reservas, confirmadas, decisiones, comprobantes
 * y KPIs). El permiso no se decide aqui: lo impone el servicio, que es quien conoce la regla.
 */
@Controller('v1/tenants/:tenantId/reservations')
export class ReservationsController {
  constructor(
    @Inject(ReservationsService) private readonly reservationsService: ReservationsService
  ) {}

  @Get('board')
  async board(
    @Param('tenantId') tenantId: string,
    @Req() request: FastifyRequest
  ): Promise<ReservationsBoardResponse> {
    const parsedTenantId = tenantIdSchema.safeParse(tenantId);
    if (!parsedTenantId.success) throw new BadRequestException('El tenant no es válido.');
    return this.reservationsService.board(request.headers.authorization, parsedTenantId.data);
  }
}
