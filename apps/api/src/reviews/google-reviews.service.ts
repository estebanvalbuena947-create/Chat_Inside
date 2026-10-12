import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import {
  googleReviewItemSchema,
  type GoogleReviewItem,
  type ToolReviewReply,
  type ToolReviewReplyResponse,
  type ToolReviewRouteResponse
} from '@chat-zernio/contracts';
import { RequestAuthenticator } from '../auth/request-authenticator';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantAccessService } from '../tenants/tenant-access.service';
import { ZernioApiClient } from '../zernio/zernio-api.client';
import { readPlaceholders } from '../tools/tool-templates.service';
import { ToolTokenService } from '../tools/tool-token.service';

/**
 * Resenas de Google Business: responderlas y verlas.
 *
 * Google conserva **una sola** respuesta del propietario: publicar otra reemplaza la anterior,
 * incluida una que alguien haya escrito a mano en la interfaz de Google. Eso manda sobre todo lo
 * demas, asi que aqui la regla es una: **no se publica sobre una resena que ya tiene respuesta**.
 * Si la tiene, la operacion se rechaza con un conflicto y quien llama decide si quiere reemplazarla
 * a proposito -- que hoy no ocurre, porque ni el bot ni la bandeja ofrecen ese boton.
 *
 * Dos caminos, una sola regla de publicacion:
 *   1. El bot, con credencial de maquina, responde solo el texto de una plantilla del espacio. Es lo
 *      que permite que las resenas de cuatro y cinco estrellas se contesten solas.
 *   2. Una persona, desde la bandeja de resenas, escribe el texto. Sirve para las de una a tres
 *      estrellas, donde una respuesta automatica suena a plantilla y hace mas dano que silencio.
 */

type FilaResena = {
  id: string;
  provider_review_id: string;
  rating: number;
  replied_at: string | null;
  reviewer_name: string | null;
  zernio_account_id: string;
};

@Injectable()
export class GoogleReviewsService {
  constructor(
    @Inject(ZernioApiClient) private readonly zernioApiClient: ZernioApiClient,
    @Inject(RequestAuthenticator) private readonly requestAuthenticator: RequestAuthenticator,
    @Inject(TenantAccessService) private readonly tenantAccessService: TenantAccessService,
    @Inject(ToolTokenService) private readonly toolTokenService: ToolTokenService,
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  /**
   * Respuesta automatica del bot.
   *
   * `reviewId` es el identificador de la resena en NUESTRA base o el nombre de recurso de Google: el
   * flujo recibe el segundo en el aviso y no tiene por que conocer el primero.
   */
  async replyFromBot(
    authorization: unknown,
    reviewId: string,
    rawBody: unknown
  ): Promise<ToolReviewReplyResponse> {
    const identity = await this.toolTokenService.authenticate(authorization);
    // El alcance es el de conversaciones: responder una resena es parte de atender el canal, y un
    // alcance nuevo obligaria a reemitir el token de maquina de quien ya esta en produccion.
    this.toolTokenService.assertScope(identity, 'conversations');

    const cuerpo = (rawBody ?? {}) as ToolReviewReply;
    const supabase = this.supabaseServerClientFactory.create();
    const texto = await this.textoDeRespuesta(supabase, identity.tenantId, cuerpo);

    return this.publicar({
      authorUserId: null,
      comment: texto,
      reviewId,
      source: 'bot',
      tenantId: identity.tenantId
    });
  }

  /** Marca que una resena queda en manos de una persona: es la transferencia del bot a la bandeja. */
  async routeToHuman(authorization: unknown, reviewId: string): Promise<ToolReviewRouteResponse> {
    const identity = await this.toolTokenService.authenticate(authorization);
    this.toolTokenService.assertScope(identity, 'conversations');

    const supabase = this.supabaseServerClientFactory.create();
    const resena = await this.buscar(supabase, identity.tenantId, reviewId);
    const ahora = new Date().toISOString();

    // Idempotente: si ya estaba derivada, se conserva el momento original. Volver a derivarla no
    // puede adelantar la espera ni borrar cuando llego.
    if (!resena.routed_to_human_at) {
      const { error } = await supabase
        .from('google_business_reviews')
        .update({ routed_to_human_at: ahora, updated_at: ahora })
        .eq('tenant_id', identity.tenantId)
        .eq('id', resena.id);
      if (error) throw new InternalServerErrorException('No fue posible derivar la reseña.');
    }

    return {
      reviewId: resena.provider_review_id,
      routedToHumanAt: resena.routed_to_human_at ?? ahora,
      tenantId: identity.tenantId
    };
  }

  /** Las resenas del espacio que la bandeja muestra: por defecto, las que siguen sin respuesta. */
  async listForInbox(
    authorization: unknown,
    tenantId: string,
    filtros: { replied?: boolean } = {}
  ): Promise<{ items: GoogleReviewItem[] }> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);
    return this.listar(tenantId, filtros);
  }

  /** La misma lista, con la credencial de maquina: la usa el bot para comprobar que quedo registrada. */
  async listForBot(
    authorization: unknown,
    filtros: { pending?: boolean } = {}
  ): Promise<{ items: GoogleReviewItem[] }> {
    const identity = await this.toolTokenService.authenticate(authorization);
    this.toolTokenService.assertScope(identity, 'conversations');
    return this.listar(identity.tenantId, {
      replied: filtros.pending === false ? true : undefined
    });
  }

  private async listar(
    tenantId: string,
    filtros: { replied?: boolean }
  ): Promise<{ items: GoogleReviewItem[] }> {
    const supabase = this.supabaseServerClientFactory.create();
    let consulta = supabase
      .from('google_business_reviews')
      .select(
        'id, rating, body, reviewer_name, replied_at, reply_comment, reply_source, routed_to_human_at, review_updated_at'
      )
      .eq('tenant_id', tenantId)
      // Las de menos estrellas primero: son las que mas urge contestar, y luego las mas recientes.
      .order('rating', { ascending: true })
      .order('review_updated_at', { ascending: false })
      .limit(100);

    consulta =
      filtros.replied === true
        ? consulta.not('replied_at', 'is', null)
        : consulta.is('replied_at', null);

    const { data, error } = await consulta;
    if (error) throw new InternalServerErrorException('No fue posible leer las reseñas.');

    return {
      items: (Array.isArray(data) ? data : []).map((fila) => {
        const f = fila as Record<string, unknown>;
        return googleReviewItemSchema.parse({
          body: f.body === null || f.body === undefined ? null : String(f.body),
          id: String(f.id),
          rating: Number(f.rating),
          repliedAt: f.replied_at ? String(f.replied_at) : null,
          replyComment: f.reply_comment ? String(f.reply_comment) : null,
          replySource:
            f.reply_source === 'bot' || f.reply_source === 'advisor' ? f.reply_source : null,
          reviewUpdatedAt: String(f.review_updated_at),
          reviewerName: f.reviewer_name ? String(f.reviewer_name) : null,
          routedToHumanAt: f.routed_to_human_at ? String(f.routed_to_human_at) : null
        });
      })
    };
  }

  /** La respuesta que escribe una persona desde la bandeja. */
  async replyFromAdvisor(
    authorization: unknown,
    tenantId: string,
    reviewId: string,
    rawBody: unknown
  ): Promise<ToolReviewReplyResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);

    const cuerpo = (rawBody ?? {}) as { comment?: unknown };
    const comment = typeof cuerpo.comment === 'string' ? cuerpo.comment.trim() : '';
    if (!comment) throw new UnprocessableEntityException('La respuesta no puede estar vacía.');
    if (comment.length > 4000) {
      throw new UnprocessableEntityException('La respuesta es demasiado larga.');
    }

    return this.publicar({
      authorUserId: identity.userId,
      comment,
      reviewId,
      source: 'advisor',
      tenantId
    });
  }

  /**
   * Publica la respuesta: lee, comprueba que no haya otra, publica y deja constancia.
   *
   * El orden importa. Se lee ANTES de publicar porque Google guarda una sola respuesta y publicar
   * encima de la de una persona no se puede deshacer; y se escribe en la base DESPUES de que el
   * proveedor acepte, para que `replied_at` signifique "publicada" y no "intentada".
   */
  private async publicar(input: {
    authorUserId: string | null;
    comment: string;
    reviewId: string;
    source: 'bot' | 'advisor';
    tenantId: string;
  }): Promise<ToolReviewReplyResponse> {
    const supabase = this.supabaseServerClientFactory.create();
    const resena = await this.buscar(supabase, input.tenantId, input.reviewId);

    if (resena.replied_at) {
      throw new ConflictException(
        'Esa reseña ya tiene respuesta. Google guarda una sola y publicar otra reemplazaría la que hay.'
      );
    }

    await this.zernioApiClient.replyToGoogleReview({
      accountId: resena.zernio_account_id,
      comment: input.comment,
      providerReviewId: resena.provider_review_id
    });

    const ahora = new Date().toISOString();
    const { error } = await supabase
      .from('google_business_reviews')
      .update({
        replied_at: ahora,
        reply_author_user_id: input.authorUserId,
        reply_comment: input.comment,
        reply_source: input.source,
        updated_at: ahora
      })
      .eq('tenant_id', input.tenantId)
      .eq('id', resena.id)
      .is('replied_at', null);

    if (error) {
      // La respuesta SI se publico en Google: no se puede deshacer. Se dice tal cual para que nadie
      // vuelva a publicarla creyendo que no salio.
      throw new InternalServerErrorException(
        'La respuesta se publicó en Google, pero no se pudo registrar. No la vuelvas a enviar.'
      );
    }

    return {
      repliedAt: ahora,
      reviewId: resena.provider_review_id,
      source: input.source,
      tenantId: input.tenantId
    };
  }

  /**
   * El texto que se va a publicar: el escrito en la peticion o el de una plantilla del espacio.
   *
   * Cuando es plantilla, todos sus huecos tienen que venir rellenos: el servidor no inventa el
   * nombre de nadie, y publicar en Google un texto con `{nombre}` a la vista seria peor que fallar.
   */
  private async textoDeRespuesta(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    cuerpo: ToolReviewReply
  ): Promise<string> {
    if (cuerpo.comment) return cuerpo.comment;
    if (!cuerpo.templateCode) {
      throw new UnprocessableEntityException('Hace falta comment o templateCode.');
    }

    const { data, error } = await supabase
      .from('message_templates')
      .select('body')
      .eq('tenant_id', tenantId)
      .eq('code', cuerpo.templateCode)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('No fue posible leer la plantilla.');
    if (!data) throw new NotFoundException('Esa plantilla no existe en este espacio.');

    const variables = cuerpo.variables ?? {};
    const faltantes = readPlaceholders(String((data as { body?: unknown }).body ?? '')).filter(
      (hueco) => !(hueco in variables)
    );
    if (faltantes.length > 0) {
      throw new UnprocessableEntityException(
        'Faltan valores para la plantilla: ' + faltantes.join(', ') + '.'
      );
    }

    const texto = readPlaceholders(String((data as { body?: unknown }).body ?? '')).reduce(
      (acumulado, hueco) => acumulado.split('{' + hueco + '}').join(String(variables[hueco])),
      String((data as { body?: unknown }).body ?? '')
    );
    const limpio = texto.trim();
    if (!limpio) throw new UnprocessableEntityException('La plantilla está vacía.');
    if (limpio.length > 4000)
      throw new UnprocessableEntityException('La plantilla es demasiado larga.');
    return limpio;
  }

  /** Busca la resena por nuestro identificador o por el nombre de recurso de Google. */
  private async buscar(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    reviewId: string
  ): Promise<FilaResena & { routed_to_human_at: string | null }> {
    const identificador = String(reviewId ?? '').trim();
    if (!identificador) throw new BadRequestException('Hace falta el identificador de la reseña.');

    const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      identificador
    );
    const { data, error } = await supabase
      .from('google_business_reviews')
      .select(
        'id, provider_review_id, zernio_account_id, rating, replied_at, reviewer_name, routed_to_human_at'
      )
      .eq('tenant_id', tenantId)
      .eq(esUuid ? 'id' : 'provider_review_id', identificador)
      .maybeSingle();

    if (error) throw new InternalServerErrorException('No fue posible leer la reseña.');
    if (!data) throw new NotFoundException('Esa reseña no existe en este espacio.');

    const fila = data as Record<string, unknown>;
    return {
      id: String(fila.id),
      provider_review_id: String(fila.provider_review_id),
      rating: Number(fila.rating),
      replied_at: fila.replied_at ? String(fila.replied_at) : null,
      reviewer_name: fila.reviewer_name ? String(fila.reviewer_name) : null,
      routed_to_human_at: fila.routed_to_human_at ? String(fila.routed_to_human_at) : null,
      zernio_account_id: String(fila.zernio_account_id)
    };
  }
}
