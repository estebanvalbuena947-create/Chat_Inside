import { Controller, Get, Headers, Inject, Param, Post, Req } from '@nestjs/common';
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

  /** Marca una conversacion con etiquetas. Es la pieza del "no insistir" en los seguimientos. */
  @Post('conversations/:conversationId/labels')
  async applyLabels(
    @Param('conversationId') conversationId: string,
    @Req() request: FastifyRequest
  ): Promise<unknown> {
    return this.service.applyLabels(request.headers.authorization, conversationId, request.body);
  }

  @Get('labels')
  async listLabels(@Headers('authorization') authorization: string | undefined): Promise<unknown> {
    return this.service.listLabels(authorization);
  }
}
