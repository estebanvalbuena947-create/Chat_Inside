import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from '@nestjs/common';
import { signMediaPaths } from '@chat-zernio/media';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { ToolTokenService } from './tool-token.service';

/**
 * Multimedia de una sede, para el bot.
 *
 * Los flujos de catalogo necesitan poder ofrecer las imagenes de la sede correspondiente. Este
 * extremo las lista y firma sus direcciones, para que n8n pueda enviarlas.
 *
 * Dos reglas:
 *   1. El espacio sale del token, nunca de la peticion.
 *   2. Solo se sirven archivos de la sede pedida: el slug se busca dentro del espacio del token.
 */

// Cuanto dura la direccion firmada, en segundos. Diez minutos, como fija docs/TOOLS_CONTRACT.md:
// el flujo la pide justo antes de enviar, asi que una ventana mas larga solo alarga la exposicion
// de un enlace que ya no hace falta.
export const BRANCH_MEDIA_URL_TTL_SECONDS = 600;
const BRANCH_MEDIA_BUCKET = 'branch-media';

@Injectable()
export class ToolBranchesService {
  constructor(
    @Inject(ToolTokenService) private readonly toolTokenService: ToolTokenService,
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  /**
   * Las sedes activas del espacio.
   *
   * El bot necesita esta lista para poder ofrecer una: no puede fijar la sede de una conversacion
   * con un slug que no conoce. Y solo las activas: ofrecer una sede cerrada seria peor que no
   * ofrecer ninguna.
   */
  async listBranches(authorization: unknown): Promise<unknown> {
    const identity = await this.toolTokenService.authenticate(authorization);
    this.toolTokenService.assertScope(identity, 'media');

    const supabase = this.supabaseServerClientFactory.create();
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, slug')
      .eq('tenant_id', identity.tenantId)
      .eq('is_active', true)
      .order('slug', { ascending: true });
    if (error) throw new InternalServerErrorException('No fue posible leer las sedes.');

    return {
      branches: (Array.isArray(data) ? data : []).map((fila) => {
        const f = fila as Record<string, unknown>;
        return { id: String(f.id ?? ''), name: String(f.name ?? ''), slug: String(f.slug ?? '') };
      }),
      tenantId: identity.tenantId
    };
  }

  async listMedia(authorization: unknown, slug: string, canal?: string): Promise<unknown> {
    const identity = await this.toolTokenService.authenticate(authorization);
    this.toolTokenService.assertScope(identity, 'media');

    const supabase = this.supabaseServerClientFactory.create();
    const sede = await this.resolveBranch(supabase, identity.tenantId, slug);

    let consulta = supabase
      .from('branch_media')
      .select('id, kind, title, storage_object_path, sort_order, channel')
      .eq('tenant_id', identity.tenantId)
      .eq('branch_id', String(sede.id))
      .order('sort_order', { ascending: true });

    // Sin canal se devuelve todo. Con canal, lo suyo y lo comun ('any'): una imagen sin canal sirve
    // en cualquier sitio; una de Instagram no vale para TikTok, que pide otro formato.
    if (canal) consulta = consulta.in('channel', ['any', canal]);

    const { data: filas, error } = await consulta;

    if (error) throw new InternalServerErrorException('No fue posible leer la multimedia.');

    const items = (Array.isArray(filas) ? filas : []) as Array<Record<string, unknown>>;
    const rutas = items
      .map((fila) =>
        typeof fila.storage_object_path === 'string' ? fila.storage_object_path : null
      )
      .filter((ruta): ruta is string => ruta !== null);

    // Las direcciones firmadas duran poco a proposito: n8n las usa en el acto y no quedan
    // circulando enlaces permanentes a archivos del negocio. Si el almacen falla, esto lanza y el
    // flujo lo ve, en vez de recibir un catalogo con las imagenes sin direccion.
    const firmadas = await signMediaPaths({
      bucket: BRANCH_MEDIA_BUCKET,
      paths: rutas,
      signer: supabase,
      ttlSeconds: BRANCH_MEDIA_URL_TTL_SECONDS
    });

    return {
      branch: { id: String(sede.id), name: String(sede.name ?? ''), slug: String(sede.slug ?? '') },
      items: items.map((fila) => {
        const ruta = typeof fila.storage_object_path === 'string' ? fila.storage_object_path : null;
        return {
          id: String(fila.id),
          kind: String(fila.kind ?? ''),
          title: fila.title ? String(fila.title) : null,
          url: ruta ? (firmadas.get(ruta) ?? null) : null
        };
      }),
      tenantId: identity.tenantId
    };
  }

  /**
   * Servicios y precios de la sede.
   *
   * Devuelve el importe y la unidad por separado, no una cadena formateada: quien redacta el mensaje
   * decide como decirlo, y el mismo dato sirve para mostrar, comparar o sumar.
   */
  async listServices(authorization: unknown, slug: string): Promise<unknown> {
    const identity = await this.toolTokenService.authenticate(authorization);
    this.toolTokenService.assertScope(identity, 'media');

    const supabase = this.supabaseServerClientFactory.create();
    const sede = await this.resolveBranch(supabase, identity.tenantId, slug);

    const { data: filas, error } = await supabase
      .from('branch_services')
      .select('id, code, name, price, currency, price_unit, notes, sort_order')
      .eq('tenant_id', identity.tenantId)
      .eq('branch_id', String(sede.id))
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) throw new InternalServerErrorException('No fue posible leer los servicios.');

    return {
      branch: {
        id: String(sede.id),
        name: String(sede.name ?? ''),
        slug: String(sede.slug ?? '')
      },
      services: (Array.isArray(filas) ? filas : []).map((fila) => {
        const s = fila as Record<string, unknown>;
        const importe = s.price;
        return {
          code: String(s.code ?? ''),
          currency: String(s.currency ?? 'MXN'),
          id: String(s.id),
          name: String(s.name ?? ''),
          notes: s.notes ? String(s.notes) : null,
          price: importe === null || importe === undefined ? null : Number(importe),
          priceUnit: String(s.price_unit ?? 'total')
        };
      }),
      tenantId: identity.tenantId
    };
  }

  /** Resuelve la sede dentro del espacio del token: un slug de otro negocio no existe. */
  private async resolveBranch(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    slug: string
  ): Promise<{ id: string; name?: unknown; slug?: unknown }> {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, slug')
      .eq('tenant_id', tenantId)
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw new InternalServerErrorException('No fue posible leer la sede.');
    if (!data) throw new NotFoundException('La sede no existe o esta inactiva en este espacio.');

    return data as { id: string; name?: unknown; slug?: unknown };
  }
}
