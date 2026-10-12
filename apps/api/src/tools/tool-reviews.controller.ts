import { Controller, Get, Inject, Param, Post, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { GoogleReviewsService } from '../reviews/google-reviews.service';

/**
 * Resenas de Google para el bot.
 *
 * La credencial de maquina identifica el espacio, asi que la ruta no lo lleva. `reviewId` acepta
 * nuestro identificador o el nombre de recurso de Google que llega en el aviso, para que el flujo no
 * tenga que traducir nada.
 */
@Controller('v1/tools/reviews')
export class ToolReviewsController {
  constructor(@Inject(GoogleReviewsService) private readonly service: GoogleReviewsService) {}

  /**
   * Publica la respuesta del propietario: el texto de una plantilla del espacio o uno escrito aqui.
   *
   * Es lo que usan las resenas de cuatro y cinco estrellas para contestarse solas.
   */
  @Post(':reviewId/reply')
  async reply(
    @Param('reviewId') reviewId: string,
    @Req() request: FastifyRequest
  ): Promise<unknown> {
    return this.service.replyFromBot(request.headers.authorization, reviewId, request.body);
  }

  /**
   * Deriva la resena a una persona: aparece en la bandeja de resenas esperando respuesta.
   *
   * Es lo que usa el bot con las de una a tres estrellas, donde una respuesta automatica suena a
   * plantilla y hace mas dano que el silencio.
   */
  @Post(':reviewId/route')
  async route(
    @Param('reviewId') reviewId: string,
    @Req() request: FastifyRequest
  ): Promise<unknown> {
    return this.service.routeToHuman(request.headers.authorization, reviewId);
  }

  /** Las resenas del espacio. Sirve para comprobar desde n8n que una quedo registrada. */
  @Get()
  async list(
    @Req() request: FastifyRequest,
    @Query('pending') pending: string | undefined
  ): Promise<unknown> {
    return this.service.listForBot(request.headers.authorization, { pending: pending !== 'false' });
  }
}
