import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Put,
  Req
} from '@nestjs/common';
import { saveWorkScheduleSchema } from '@chat-zernio/contracts';
import type { FastifyRequest } from 'fastify';
import { WorkSchedulesService } from './work-schedules.service';

@Controller('v1/tenants/:tenantId/work-schedules')
export class WorkSchedulesController {
  constructor(@Inject(WorkSchedulesService) private readonly service: WorkSchedulesService) {}
  @Get()
  list(@Param('tenantId', new ParseUUIDPipe()) tenantId: string, @Req() request: FastifyRequest) {
    return this.service.list(request.headers.authorization, tenantId);
  }
  @Put(':userId')
  save(
    @Param('tenantId', new ParseUUIDPipe()) tenantId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() body: unknown,
    @Req() request: FastifyRequest
  ) {
    const parsed = saveWorkScheduleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('El horario no es válido.');
    return this.service.save(request.headers.authorization, tenantId, userId, parsed.data);
  }
}
