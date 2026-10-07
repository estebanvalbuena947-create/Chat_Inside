import { createHash } from 'node:crypto';
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import { signMediaPaths, storeRemoteMedia, supabaseMediaStorage } from '@chat-zernio/media';
import { z } from 'zod';
import { RequestAuthenticator } from '../auth/request-authenticator';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantAccessService } from '../tenants/tenant-access.service';

/**
 * Multimedia de una sede, administrada desde la interfaz.
 *
 * Este servicio NO descarga ni reconoce tipos: eso lo hace `@chat-zernio/media`, que ya se usa para
 * los adjuntos de las conversaciones y los avatares. Aqui solo se decide lo que cambia en este caso
 * -- el bucket, la ruta y que contenidos se aceptan -- y se registra la fila.
 *
 * La ruta se deriva del hash de la direccion de origen. Eso la hace determinista: la misma foto
 * importada dos veces apunta al mismo archivo, y la restriccion unica de la tabla
 * (`branch_id, storage_object_path`) impide registrarla dos veces. La idempotencia no se programa:
 * sale del esquema.
 *
 * La sesion es de persona, no de maquina: esto lo usa un administrador desde la interfaz, y la
 * pertenencia al espacio se comprueba. Las herramientas de n8n van por otro camino.
 */

export const BRANCH_MEDIA_BUCKET = 'branch-media';
const MAX_BYTES = 25 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 20_000;
/** Lo que dura el enlace firmado: lo justo para pintar la pantalla. */
const SIGNED_URL_TTL_SECONDS = 600;

/** La tabla solo admite estos dos tipos, y se comprueba antes de llegar a su restriccion. */
const KIND_BY_PREFIX: Array<{ kind: 'image' | 'video'; prefix: string }> = [
  { kind: 'video', prefix: 'video/' },
  { kind: 'image', prefix: 'image/' }
];

export const importBranchMediaSchema = z.object({
  branchSlug: z.string().trim().min(1).max(120),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  sourceUrl: z.string().trim().min(1).max(2048),
  title: z.string().trim().max(160).optional()
});

@Injectable()
export class BranchMediaService {
  constructor(
    @Inject(RequestAuthenticator) private readonly requestAuthenticator: RequestAuthenticator,
    @Inject(TenantAccessService) private readonly tenantAccessService: TenantAccessService,
    @Inject(SupabaseServerClientFactory)
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  /**
   * El material de una sede, para la pantalla que lo administra.
   *
   * Devuelve lo que necesita quien pinta la galeria -- titulo, tipo, orden -- mas un enlace firmado
   * por archivo. La ruta interna del almacen no sale nunca: se firma al vuelo y el enlace dura lo
   * justo, igual que en la multimedia de las conversaciones.
   *
   * La credencial es de persona, no de maquina: esto lo mira un administrador. El listado del bot
   * es otro, con otro aislamiento.
   */
  async list(authorization: unknown, tenantId: string, branchSlug: string): Promise<unknown> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);

    const supabase = this.supabaseServerClientFactory.create();
    const sede = await this.resolveBranch(supabase, tenantId, branchSlug);

    const { data: filas, error } = await supabase
      .from('branch_media')
      .select('id, kind, sort_order, storage_object_path, title')
      .eq('tenant_id', tenantId)
      .eq('branch_id', String(sede.id))
      .order('sort_order', { ascending: true });
    if (error)
      throw new InternalServerErrorException('No fue posible leer el material de la sede.');

    const items = (Array.isArray(filas) ? filas : []) as Array<Record<string, unknown>>;
    const rutas = items
      .map((fila) =>
        typeof fila.storage_object_path === 'string' ? fila.storage_object_path : null
      )
      .filter((ruta): ruta is string => ruta !== null);

    // La ruta interna no sale nunca: se firma al vuelo, en lote y sin repetir rutas. Si el almacen
    // falla, esto lanza y la pantalla lo dice, en vez de mostrar un catalogo vacio que no lo esta.
    const firmadas = await signMediaPaths({
      bucket: BRANCH_MEDIA_BUCKET,
      paths: rutas,
      signer: supabase,
      ttlSeconds: SIGNED_URL_TTL_SECONDS
    });

    return {
      branch: { id: String(sede.id), name: String(sede.name ?? ''), slug: String(sede.slug ?? '') },
      items: items.map((fila) => {
        const ruta = typeof fila.storage_object_path === 'string' ? fila.storage_object_path : null;
        return {
          id: String(fila.id ?? ''),
          kind: String(fila.kind ?? 'image'),
          sortOrder: Number(fila.sort_order ?? 0),
          title: fila.title === null || fila.title === undefined ? null : String(fila.title),
          // Sin copia en el almacen no hay enlace, y la pantalla lo muestra como pendiente.
          url: ruta ? (firmadas.get(ruta) ?? null) : null
        };
      }),
      tenantId
    };
  }
  /** Importa un archivo desde una direccion publica al material de una sede. */
  async importFromUrl(
    authorization: unknown,
    tenantId: string,
    rawBody: unknown
  ): Promise<unknown> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);

    const parsed = importBranchMediaSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new UnprocessableEntityException(
        'Hacen falta la sede y una direccion de origen valida.'
      );
    }
    const { branchSlug, sortOrder, sourceUrl, title } = parsed.data;

    const supabase = this.supabaseServerClientFactory.create();
    const sede = await this.resolveBranch(supabase, tenantId, branchSlug);
    const branchId = String(sede.id);

    const hash = createHash('sha256').update(sourceUrl).digest('hex').slice(0, 32);
    const guardado = await storeRemoteMedia({
      accept: (media) =>
        KIND_BY_PREFIX.some((entrada) => media.contentType.startsWith(entrada.prefix)),
      bucket: BRANCH_MEDIA_BUCKET,
      maxBytes: MAX_BYTES,
      path: (media) => `${tenantId}/${branchId}/${hash}.${media.extension}`,
      sourceUrl,
      storage: supabaseMediaStorage(supabase),
      timeoutMs: DOWNLOAD_TIMEOUT_MS
    });

    if (!guardado) {
      throw new UnprocessableEntityException(
        'No se pudo traer el archivo: comprueba que la direccion sea publica y que sea una imagen o un video.'
      );
    }

    const kind = KIND_BY_PREFIX.find((entrada) =>
      guardado.contentType.startsWith(entrada.prefix)
    )?.kind;
    if (!kind) {
      throw new UnprocessableEntityException('El archivo no es una imagen ni un video.');
    }

    // `upsert` sobre la clave unica de la tabla: volver a importar la misma direccion actualiza el
    // titulo y el orden en lugar de fallar. El archivo del almacen se sobrescribe igual.
    const { data, error } = await supabase
      .from('branch_media')
      .upsert(
        {
          branch_id: branchId,
          kind,
          sort_order: sortOrder ?? 0,
          storage_object_path: guardado.path,
          tenant_id: tenantId,
          title: title ?? null
        },
        { onConflict: 'branch_id,storage_object_path' }
      )
      .select('id, kind, sort_order, storage_object_path, title')
      .single();
    if (error) {
      throw new InternalServerErrorException('El archivo se guardo, pero no se pudo registrar.');
    }

    const fila = (data ?? {}) as Record<string, unknown>;
    return {
      id: String(fila.id ?? ''),
      kind: String(fila.kind ?? kind),
      sortOrder: Number(fila.sort_order ?? 0),
      tenantId,
      title: fila.title === null || fila.title === undefined ? null : String(fila.title),
      // La ruta interna no sale nunca: quien la necesite pide un enlace firmado.
      contentType: guardado.contentType
    };
  }

  /** La sede, dentro del espacio. Un slug de otro negocio no existe. */
  private async resolveBranch(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    slug: string
  ): Promise<Record<string, unknown>> {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name, slug')
      .eq('tenant_id', tenantId)
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw new InternalServerErrorException('No fue posible leer la sede.');
    if (!data) throw new NotFoundException('Esa sede no existe en este espacio.');
    return data as Record<string, unknown>;
  }
}
