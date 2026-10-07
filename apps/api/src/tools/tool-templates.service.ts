import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from '@nestjs/common';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { ToolTokenService } from './tool-token.service';

/**
 * Plantillas de mensaje, para el bot.
 *
 * Sustituye a los textos que hoy viven dentro de los flujos de ManyChat: la confirmacion, el
 * recordatorio, el aviso de comprobante. Traerlos a una tabla tiene el mismo efecto que traer los
 * precios -- cambiar una confirmacion es editar una fila, no abrir un flujo.
 *
 * El texto lleva huecos entre llaves ({fecha}, {hora}, {sede}) y el servicio DEVUELVE la lista de
 * huecos que contiene. Asi quien envia sabe exactamente que tiene que rellenar, en lugar de
 * descubrirlo leyendo el texto.
 *
 * Dos reglas, las mismas que en el resto de herramientas:
 *   1. El espacio sale del token, nunca de la peticion.
 *   2. Solo se sirven plantillas de ese espacio.
 */

/** Los huecos del texto: {fecha}, {hora}, {sede}... */
const HUECO = /\{([a-zA-Z_][a-zA-Z0-9_]{0,30})\}/g;

export function readPlaceholders(body: string): string[] {
  const encontrados = new Set<string>();
  for (const coincidencia of body.matchAll(HUECO)) {
    const nombre = coincidencia[1];
    if (nombre) encontrados.add(nombre);
  }
  return [...encontrados];
}

@Injectable()
export class ToolTemplatesService {
  constructor(
    @Inject(ToolTokenService) private readonly toolTokenService: ToolTokenService,
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  /** Las plantillas activas del espacio, opcionalmente filtradas por canal. */
  async list(authorization: unknown, canal: string | undefined): Promise<unknown> {
    const identity = await this.toolTokenService.authenticate(authorization);
    this.toolTokenService.assertScope(identity, 'messages');

    const supabase = this.supabaseServerClientFactory.create();
    let consulta = supabase
      .from('message_templates')
      .select('code, name, body, channel, sort_order')
      .eq('tenant_id', identity.tenantId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    // Sin canal se devuelven todas. Con canal, las suyas y las comunes ('any'): una plantilla
    // generica vale en cualquier sitio, una de Instagram no vale en TikTok.
    if (canal) consulta = consulta.in('channel', ['any', canal]);

    const { data, error } = await consulta;
    if (error) throw new InternalServerErrorException('No fue posible leer las plantillas.');

    return {
      templates: (Array.isArray(data) ? data : []).map((fila) => this.asTemplate(fila)),
      tenantId: identity.tenantId
    };
  }

  /** Una plantilla por su codigo, con los huecos que hay que rellenar. */
  async read(authorization: unknown, code: string): Promise<unknown> {
    const identity = await this.toolTokenService.authenticate(authorization);
    this.toolTokenService.assertScope(identity, 'messages');

    if (!code) throw new NotFoundException('Hace falta el codigo de la plantilla.');

    const supabase = this.supabaseServerClientFactory.create();
    const { data, error } = await supabase
      .from('message_templates')
      .select('code, name, body, channel, sort_order')
      .eq('tenant_id', identity.tenantId)
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw new InternalServerErrorException('No fue posible leer la plantilla.');
    if (!data) throw new NotFoundException('Esa plantilla no existe en este espacio.');

    return { ...this.asTemplate(data), tenantId: identity.tenantId };
  }

  private asTemplate(fila: unknown): {
    body: string;
    channel: string;
    code: string;
    name: string;
    placeholders: string[];
  } {
    const f = (fila ?? {}) as Record<string, unknown>;
    const body = String(f.body ?? '');
    return {
      body,
      channel: String(f.channel ?? 'any'),
      code: String(f.code ?? ''),
      name: String(f.name ?? ''),
      placeholders: readPlaceholders(body)
    };
  }
}
