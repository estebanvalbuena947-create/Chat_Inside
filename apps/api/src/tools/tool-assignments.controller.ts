import { Controller, Get, Headers, Inject, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ToolAssignmentsService } from './tool-assignments.service';

/** Asignaciones y etiquetas para el bot, con credencial de maquina. */
@Controller('v1/tools')
export class ToolAssignmentsController {
  constructor(@Inject(ToolAssignmentsService) private readonly service: ToolAssignmentsService) {}

  @Post('assignments')
  async assign(@Req() request: FastifyRequest): Promise<unknown> {
    return this.service.assign(request.headers.authorization, request.body);
  }

  @Get('labels')
  async listLabels(@Headers('authorization') authorization: string | undefined): Promise<unknown> {
    return this.service.listLabels(authorization);
  }
}
