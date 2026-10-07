import {
  Inject,
  Injectable,
  InternalServerErrorException,
  UnprocessableEntityException
} from '@nestjs/common';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { ToolTokenService } from './tool-token.service';

/**
 * Campos por contacto, para el bot.
 *
 * Sustituye a los campos personalizados de ManyChat. El cuerpo es DELIBERADAMENTE el mismo que ya
 * mandan los flujos:
 *
 *   { contactId, fields: [{ field_name, field_value }] }
 *
 * Asi la migracion de esos nodos es cambiar la direccion, no reescribir el cuerpo. Menos cambios,
 * menos riesgo.
 *
 * Reglas:
 *   1. El espacio sale del token, nunca de la peticion.
 *   2. El contacto debe pertenecer a ese espacio: no se escribe en la ficha de otro negocio.
 *   3. Escribir dos veces el mismo campo ACTUALIZA; nunca duplica.
 */

const MAX_CAMPOS_POR_LLAMADA = 50;

type CampoEntrante = { field_name: string; field_value: string | null };

@Injectable()
export class ToolContactFieldsService {
  constructor(
    @Inject(ToolTokenService) private readonly toolTokenService: ToolTokenService,
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  /**
   * Resuelve el contacto a partir de la conversacion.
   *
   * Los flujos conocen la conversacion, no la ficha del contacto. Resolverlo aqui hace que su
   * migracion sea cambiar la direccion y el nombre del campo, en lugar de tener que buscar antes el
   * contacto en otra llamada.
   */
  private async resolveContactFromConversation(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    conversationId: string
  ): Promise<string> {
    const { data, error } = await supabase
      .from('conversations')
      .select('contact_id')
      .eq('tenant_id', tenantId)
      .eq('id', conversationId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('No fue posible leer la conversacion.');

    const fila = (data ?? null) as { contact_id?: unknown } | null;
    const contacto = typeof fila?.contact_id === 'string' ? fila.contact_id : '';
    if (!contacto) {
      throw new UnprocessableEntityException('La conversacion no existe en este espacio.');
    }
    return contacto;
  }

  /** Escribe o actualiza campos del contacto. */
  async write(authorization: unknown, rawBody: unknown): Promise<unknown> {
    const identity = await this.toolTokenService.authenticate(authorization);
    this.toolTokenService.assertScope(identity, 'conversations');

    const cuerpo = (rawBody ?? {}) as {
      contactId?: unknown;
      conversationId?: unknown;
      fields?: unknown;
    };
    const contactIdDirecto = typeof cuerpo.contactId === 'string' ? cuerpo.contactId : '';
    const conversationId = typeof cuerpo.conversationId === 'string' ? cuerpo.conversationId : '';
    if (!contactIdDirecto && !conversationId) {
      throw new UnprocessableEntityException('Hace falta contactId o conversationId.');
    }

    const campos = this.readFields(cuerpo.fields);
    if (campos.length === 0) {
      throw new UnprocessableEntityException('Hace falta al menos un campo con nombre y valor.');
    }

    const supabase = this.supabaseServerClientFactory.create();
    let contactId = contactIdDirecto;
    if (contactId) {
      await this.assertContact(supabase, identity.tenantId, contactId);
    } else {
      contactId = await this.resolveContactFromConversation(
        supabase,
        identity.tenantId,
        conversationId
      );
    }

    const filas = campos.map((campo) => ({
      contact_id: contactId,
      field_name: campo.field_name,
      field_value: campo.field_value,
      tenant_id: identity.tenantId,
      updated_at: new Date().toISOString()
    }));

    const { data, error } = await supabase
      .from('contact_fields')
      .upsert(filas, { onConflict: 'contact_id,field_name' })
      .select('field_name, field_value');

    if (error) throw new InternalServerErrorException('No fue posible guardar los campos.');

    return {
      contactId,
      fields: (Array.isArray(data) ? data : []).map((fila) => {
        const f = fila as Record<string, unknown>;
        return {
          field_name: String(f.field_name ?? ''),
          field_value:
            f.field_value === null || f.field_value === undefined ? null : String(f.field_value)
        };
      }),
      tenantId: identity.tenantId
    };
  }

  /** Los campos guardados de un contacto. */
  async read(authorization: unknown, contactId: string): Promise<unknown> {
    const identity = await this.toolTokenService.authenticate(authorization);
    this.toolTokenService.assertScope(identity, 'conversations');

    if (!contactId) throw new UnprocessableEntityException('Hace falta contactId.');

    const supabase = this.supabaseServerClientFactory.create();
    await this.assertContact(supabase, identity.tenantId, contactId);

    const { data, error } = await supabase
      .from('contact_fields')
      .select('field_name, field_value, updated_at')
      .eq('tenant_id', identity.tenantId)
      .eq('contact_id', contactId)
      .order('field_name', { ascending: true });

    if (error) throw new InternalServerErrorException('No fue posible leer los campos.');

    return {
      contactId,
      fields: (Array.isArray(data) ? data : []).map((fila) => {
        const f = fila as Record<string, unknown>;
        return {
          field_name: String(f.field_name ?? ''),
          field_value:
            f.field_value === null || f.field_value === undefined ? null : String(f.field_value)
        };
      }),
      tenantId: identity.tenantId
    };
  }

  private readFields(valor: unknown): CampoEntrante[] {
    if (!Array.isArray(valor)) return [];
    return valor
      .slice(0, MAX_CAMPOS_POR_LLAMADA)
      .map((item) => {
        const c = (item ?? {}) as Record<string, unknown>;
        const nombre = typeof c.field_name === 'string' ? c.field_name.trim() : '';
        if (nombre.length === 0 || nombre.length > 60) return null;
        const crudo = c.field_value;
        return {
          field_name: nombre,
          field_value:
            crudo === null || crudo === undefined
              ? null
              : typeof crudo === 'string'
                ? crudo
                : String(crudo)
        };
      })
      .filter((campo): campo is CampoEntrante => campo !== null);
  }

  private async assertContact(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    contactId: string
  ): Promise<void> {
    const { data, error } = await supabase
      .from('contacts')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', contactId)
      .maybeSingle();

    if (error) throw new InternalServerErrorException('No fue posible comprobar el contacto.');
    if (!data) throw new UnprocessableEntityException('Ese contacto no pertenece a este espacio.');
  }
}
