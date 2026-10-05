import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException
} from '@nestjs/common';
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

/** Cuanto dura la direccion firmada, en segundos. Suficiente para que n8n la use en el acto. */
export const BRANCH_MEDIA_URL_TTL_SECONDS = 3600;
const BRANCH_MEDIA_BUCKET = 'branch-media';

@Injectable()
export class ToolBranchesService {
  constructor(
    @Inject(ToolTokenService) private readonly toolTokenService: ToolTokenService,
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  async listMedia(authorization: unknown, slug: string): Promise<unknown> {
    const identity = await this.toolTokenService.authenticate(authorization);
    this.toolTokenService.assertScope(identity, 'media');

    const supabase = this.supabaseServerClientFactory.create();

    const { data: sede, error: sedeError } = await supabase
      .from('branches')
      .select('id, name, slug')
      .eq('tenant_id', identity.tenantId)
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();

    if (sedeError) throw new InternalServerErrorException('No fue posible leer la sede.');
    if (!sede) throw new NotFoundException('La sede no existe o esta inactiva en este espacio.');

    const { data: filas, error } = await supabase
      .from('branch_media')
      .select('id, kind, title, storage_object_path, sort_order')
      .eq('tenant_id', identity.tenantId)
      .eq('branch_id', String(sede.id))
      .order('sort_order', { ascending: true });

    if (error) throw new InternalServerErrorException('No fue posible leer la multimedia.');

    const items = (Array.isArray(filas) ? filas : []) as Array<Record<string, unknown>>;
    const rutas = items
      .map((fila) =>
        typeof fila.storage_object_path === 'string' ? fila.storage_object_path : null
      )
      .filter((ruta): ruta is string => ruta !== null);

    // Las direcciones firmadas duran poco a proposito: n8n las usa en el acto y no quedan
    // circulando enlaces permanentes a archivos del negocio.
    const firmadas = new Map<string, string>();
    if (rutas.length > 0) {
      const { data: firmas, error: firmasError } = await supabase.storage
        .from(BRANCH_MEDIA_BUCKET)
        .createSignedUrls(rutas, BRANCH_MEDIA_URL_TTL_SECONDS);
      if (firmasError) {
        throw new InternalServerErrorException('No fue posible firmar la multimedia de la sede.');
      }
      for (const firma of (firmas ?? []) as Array<{ path?: string | null; signedUrl?: string }>) {
        if (typeof firma.path === 'string' && typeof firma.signedUrl === 'string') {
          firmadas.set(firma.path, firma.signedUrl);
        }
      }
    }

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
}
