import {
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import { ConversionService } from '../conversions/conversion.service';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { ToolTokenService } from './tool-token.service';

/**
 * Conversiones ganadas, para el bot.
 *
 * Ocupa el hueco que dejaba el nodo CAPI de ManyChat: cuando el pago se confirma -- solo, o aprobado
 * a mano -- el flujo marca la conversion y el trabajador la entrega a Meta. Aqui solo se encola: el
 * hecho de negocio no espera al proveedor.
 *
 * El alcance es `conversations` y no uno propio. La conversion se marca sobre una conversacion, y un
 * alcance nuevo obligaria a reemitir el token de maquina de quien ya esta en produccion: mas riesgo
 * que beneficio.
 *
 * Es idempotente por diseno del propio evento: la clave es estable por conversacion, asi que un
 * reintento de n8n no cuenta la compra dos veces.
 */
@Injectable()
export class ToolConversionsService {
  constructor(
    @Inject(ToolTokenService) private readonly toolTokenService: ToolTokenService,
    @Inject(ConversionService) private readonly conversionService: ConversionService,
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  async enqueue(authorization: unknown, rawBody: unknown): Promise<unknown> {
    const identity = await this.toolTokenService.authenticate(authorization);
    this.toolTokenService.assertScope(identity, 'conversations');

    const cuerpo = (rawBody ?? {}) as Record<string, unknown>;
    const conversationId = typeof cuerpo.conversationId === 'string' ? cuerpo.conversationId : '';
    if (!conversationId) {
      throw new UnprocessableEntityException('Hace falta conversationId.');
    }

    const amount = typeof cuerpo.amount === 'number' ? cuerpo.amount : Number(cuerpo.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new UnprocessableEntityException('Hace falta un importe valido.');
    }

    const currency =
      typeof cuerpo.currency === 'string' && cuerpo.currency.trim().length > 0
        ? cuerpo.currency.trim().toUpperCase()
        : 'MXN';
    const occurredAt =
      typeof cuerpo.occurredAt === 'string' && cuerpo.occurredAt.trim().length > 0
        ? cuerpo.occurredAt
        : new Date().toISOString();

    // La conversacion se comprueba ANTES de encolar. Sin ella no hay a quien atribuir la conversion,
    // y el evento quedaria en la cola para no poder enviarse nunca.
    const supabase = this.supabaseServerClientFactory.create();
    const { data, error } = await supabase
      .from('conversations')
      .select('id')
      .eq('tenant_id', identity.tenantId)
      .eq('id', conversationId)
      .maybeSingle();
    if (error) {
      throw new UnprocessableEntityException('No fue posible leer la conversacion.');
    }
    if (!data) {
      throw new NotFoundException('Esa conversacion no existe en este espacio.');
    }

    const resultado = await this.conversionService.enqueueWonConversion({
      amount,
      conversationId,
      currency,
      occurredAt,
      tenantId: identity.tenantId
    });

    return { ...resultado, conversationId, tenantId: identity.tenantId };
  }
}
