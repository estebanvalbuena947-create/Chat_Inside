import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { buildWonConversionEvent } from './conversion-event';

/**
 * Encola conversiones hacia Meta.
 *
 * No envia nada: escribe el evento en la cola y el trabajador se ocupa del envio. Asi el hecho de
 * negocio nunca espera a Meta, y un fallo del proveedor no puede tumbar la accion del asesor.
 *
 * Ver specs/019-zernio-meta-conversions-api.md y la migracion de conversion_integrations y
 * conversion_events.
 *
 * Pieza conectada a medias a proposito: hoy la usa el endpoint del bot (POST /v1/tools/conversions).
 * El camino de la conversacion ganada de la bandeja todavia NO la llama, porque falta la decision de
 * negocio sobre que hecho cuenta como conversion, que la especificacion deja abierta a proposito. La
 * otra mitad si esta viva: el enviador del trabajador (`apps/worker/src/conversion-sender.ts`) drena
 * la cola y entrega a Meta desde el bucle del proceso.
 */
@Injectable()
export class ConversionService {
  constructor(private readonly supabaseServerClientFactory: SupabaseServerClientFactory) {}

  /**
   * Encola la conversion de una conversacion ganada.
   *
   * Es idempotente por diseño: el eventId es estable por conversacion, y el indice unico impide
   * encolar dos veces el mismo hecho. Si la integracion no esta activa, no se hace nada y se
   * informa del motivo en lugar de fallar.
   */
  async enqueueWonConversion(input: {
    amount: number;
    conversationId: string;
    currency: string;
    occurredAt: string;
    tenantId: string;
  }): Promise<{ queued: boolean; reason?: string }> {
    const supabase = this.supabaseServerClientFactory.create();

    const { data: integracion, error: integracionError } = await supabase
      .from('conversion_integrations')
      .select('enabled, include_contact_data')
      .eq('tenant_id', input.tenantId)
      .maybeSingle();

    if (integracionError) {
      throw new InternalServerErrorException(
        'No fue posible leer la configuracion de conversiones.'
      );
    }
    if (!integracion || integracion.enabled !== true) {
      return { queued: false, reason: 'La integracion de conversiones no esta activa.' };
    }

    const { data: conversacion, error: conversacionError } = await supabase
      .from('conversations')
      .select('id, contact:contacts(email, external_reference, phone_e164, platform_user_id)')
      .eq('tenant_id', input.tenantId)
      .eq('id', input.conversationId)
      .maybeSingle();

    if (conversacionError) {
      throw new InternalServerErrorException('No fue posible leer el contacto de la conversacion.');
    }
    const contacto = (conversacion?.contact ?? null) as {
      email?: string | null;
      external_reference?: string | null;
      phone_e164?: string | null;
      platform_user_id?: string | null;
    } | null;

    const construido = buildWonConversionEvent({
      amount: input.amount,
      contact: {
        email: contacto?.email ?? null,
        externalReference: contacto?.external_reference ?? null,
        phoneE164: contacto?.phone_e164 ?? null,
        platformUserId: contacto?.platform_user_id ?? null
      },
      conversationId: input.conversationId,
      currency: input.currency,
      includeContactData: integracion.include_contact_data === true,
      occurredAt: input.occurredAt,
      tenantId: input.tenantId
    });

    if (!construido.ok) {
      return { queued: false, reason: construido.reason };
    }

    const { error: encolarError } = await supabase.from('conversion_events').insert({
      action_source: 'crm',
      conversation_id: input.conversationId,
      currency: input.currency,
      event_id: construido.value.eventId,
      event_name: construido.value.event.eventName,
      event_time: input.occurredAt,
      status: 'pending',
      tenant_id: input.tenantId,
      value_amount: input.amount
    });

    // 23505: el mismo hecho ya estaba encolado. Es el caso bueno, no un error.
    if (encolarError && encolarError.code !== '23505') {
      throw new InternalServerErrorException('No fue posible encolar la conversion.');
    }

    return { queued: true };
  }
}
