import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import type { WhatsappTemplate, WhatsappTemplateItem } from '@chat-zernio/contracts';
import { whatsappTemplateSendability } from '@chat-zernio/domain';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { ZernioApiClient } from './zernio-api.client';

/**
 * Catalogo de plantillas aprobadas de WhatsApp del espacio.
 *
 * Vive aqui porque es el modulo que conoce al proveedor, y resuelve dos cosas que nadie mas puede
 * resolver: que cuentas de WhatsApp tiene el espacio, y a cual de ellas pertenece cada plantilla.
 *
 * La regla de lo que se puede enviar NO vive aqui: vive en el dominio
 * (`whatsappTemplateSendability`). Este servicio solo la aplica y traduce su motivo a un texto que
 * la pantalla pueda mostrar, para que la interfaz no tenga que volver a deducirla.
 */

export type CatalogTemplate = WhatsappTemplate & { channelAccountIds: string[] };

export type ChannelAccountTemplates = {
  channelAccountId: string;
  templates: WhatsappTemplate[];
};

function blockedReasonFor(
  sendability: ReturnType<typeof whatsappTemplateSendability>,
  variables: readonly string[]
): string | null {
  if (sendability.sendable) return null;
  if (sendability.reason === 'not_approved') return 'Meta todavía no la tiene aprobada.';
  if (sendability.reason === 'missing_language') {
    return 'Meta no informó su idioma, así que no se puede resolver.';
  }
  return `Necesita valores para ${variables.join(', ')}.`;
}

@Injectable()
export class WhatsappTemplateCatalog {
  constructor(
    @Inject(ZernioApiClient) private readonly zernioApiClient: ZernioApiClient,
    @Inject(SupabaseServerClientFactory)
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  /**
   * Las plantillas de todas las cuentas de WhatsApp del espacio, sin duplicar nombre e idioma.
   *
   * La misma plantilla en dos cuentas es la misma plantilla: se devuelve una vez con las dos, para
   * que la pantalla no muestre dos veces lo mismo y para que quien envia sepa desde que cuenta puede
   * hacerlo. Sin ninguna cuenta conectada la lista esta vacia, que es la verdad y no un error.
   */
  async listForTenant(tenantId: string): Promise<WhatsappTemplateItem[]> {
    const cuentas = await this.readWhatsappAccounts(tenantId);
    const porReferencia = new Map<string, CatalogTemplate>();

    for (const cuenta of cuentas) {
      const plantillas = await this.zernioApiClient.listWhatsappTemplates(cuenta.providerAccountId);
      for (const plantilla of plantillas) {
        const clave = `${plantilla.name}|${plantilla.language ?? ''}`;
        const existente = porReferencia.get(clave);
        if (existente) {
          if (!existente.channelAccountIds.includes(cuenta.id)) {
            existente.channelAccountIds.push(cuenta.id);
          }
          continue;
        }
        porReferencia.set(clave, { ...plantilla, channelAccountIds: [cuenta.id] });
      }
    }

    return [...porReferencia.values()].map((plantilla) => this.asItem(plantilla));
  }

  /**
   * Las plantillas de UNA cuenta del espacio.
   *
   * Devuelve nulo cuando esa cuenta no es una cuenta de WhatsApp de este espacio: quien llama decide
   * el error, porque solo el sabe si eso es un rechazo para el usuario o un estado inesperado.
   */
  async readForChannelAccount(
    tenantId: string,
    channelAccountId: string
  ): Promise<ChannelAccountTemplates | null> {
    const supabase = this.supabaseServerClientFactory.create();
    const { data, error } = await supabase
      .from('channel_accounts')
      .select('id, provider_account_id')
      .eq('tenant_id', tenantId)
      .eq('id', channelAccountId)
      .eq('provider', 'zernio')
      .eq('platform', 'whatsapp')
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException('No fue posible resolver la cuenta de WhatsApp.');
    }
    if (!data?.id || typeof data.provider_account_id !== 'string' || !data.provider_account_id) {
      return null;
    }

    return {
      channelAccountId: data.id,
      templates: await this.zernioApiClient.listWhatsappTemplates(data.provider_account_id)
    };
  }

  private asItem(plantilla: CatalogTemplate): WhatsappTemplateItem {
    const sendability = whatsappTemplateSendability(plantilla);
    return {
      ...plantilla,
      blockedReason: blockedReasonFor(sendability, plantilla.variables),
      sendable: sendability.sendable
    };
  }

  private async readWhatsappAccounts(
    tenantId: string
  ): Promise<Array<{ id: string; providerAccountId: string }>> {
    const supabase = this.supabaseServerClientFactory.create();
    const { data, error } = await supabase
      .from('channel_accounts')
      .select('id, provider_account_id')
      .eq('tenant_id', tenantId)
      .eq('provider', 'zernio')
      .eq('platform', 'whatsapp')
      .order('created_at', { ascending: false });
    if (error) {
      throw new InternalServerErrorException('No fue posible resolver la cuenta de WhatsApp.');
    }

    return (data ?? []).flatMap((fila) =>
      typeof fila.id === 'string' &&
      typeof fila.provider_account_id === 'string' &&
      fila.provider_account_id
        ? [{ id: fila.id, providerAccountId: fila.provider_account_id }]
        : []
    );
  }
}
