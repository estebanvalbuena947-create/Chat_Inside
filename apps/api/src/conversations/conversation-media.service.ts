import { createHash } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import {
  conversationMediaUploadResponseSchema,
  mediaListResponseSchema,
  type AttachmentKind,
  type ConversationMediaUploadResponse,
  type MediaListQuery,
  type MediaListResponse,
  type OutboundMediaExtension
} from '@chat-zernio/contracts';
import {
  decodeMediaCursor,
  encodeMediaCursor,
  outboundMediaTypeForExtension,
  sanitizeSearchTerm
} from '@chat-zernio/domain';
import { recognizeMedia, signMediaPaths, supabaseMediaStorage } from '@chat-zernio/media';
import { RequestAuthenticator } from '../auth/request-authenticator';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantAccessService } from '../tenants/tenant-access.service';

export const MEDIA_BUCKET = 'conversation-media';

/**
 * La procedencia que se guarda cuando el archivo lo subio quien atiende la conversacion.
 *
 * El catalogo administrado de una sede usa la suya (`branch_media`): quien puso el archivo ahi es un
 * dato que hay que poder auditar, no algo que se deduzca del bucket donde vive.
 */
export const CONVERSATION_UPLOAD_SOURCE = 'conversation_upload';

const logger = new Logger('ConversationMedia');
const SIGNED_URL_TTL_SECONDS = 600;
const DEFAULT_PAGE_SIZE = 30;
const SEARCH_CONTACT_LIMIT = 50;
/** El mismo limite que impone el lector multipart (`apps/api/src/main.ts`) y el bucket. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const mediaSelection =
  'id, conversation_id, message_id, kind, content_type, created_at, bucket, storage_object_path, source_title, conversation:conversations(contact_id, contact:contacts(display_name))';

type PersistedAttachment = {
  bucket: unknown;
  content_type: unknown;
  conversation: unknown;
  conversation_id: unknown;
  created_at: unknown;
  id: unknown;
  kind: unknown;
  message_id: unknown;
  source_title?: unknown;
  storage_object_path: unknown;
};

/** Lo que hay que firmar: la ruta y el bucket donde vive. El bucket no se adivina. */
export type MediaSignatureTarget = { bucket: string; path: string };

/**
 * La ruta de una carga en el bucket de la conversacion.
 *
 * Es determinista a proposito: el identificador de la subida es el hash de los bytes, asi que la
 * misma carga apunta siempre al mismo objeto y el envio puede componer la ruta sin custodiar un
 * token. La componen la subida y el envio; por eso vive en un solo sitio.
 */
export function conversationMediaPath(input: {
  conversationId: string;
  extension: string;
  tenantId: string;
  uploadId: string;
}): string {
  return `${input.tenantId}/${input.conversationId}/${input.uploadId}.${input.extension}`;
}

/**
 * La clave de una firma.
 *
 * La misma ruta en dos buckets son dos archivos distintos -- el catalogo de una sede y la carga de
 * una conversacion pueden coincidir en el texto de la ruta --, asi que la firma se busca por el par.
 */
export function mediaSignatureKey(bucket: string, path: string): string {
  return `${bucket}\u0000${path}`;
}

/**
 * Firma en lote las copias propias, cada grupo contra su bucket. El bucket es privado y su ruta
 * interna nunca sale al cliente: solo se entrega un enlace temporal.
 *
 * Agrupa porque hoy hay DOS procedencias -- la carga de la conversacion y el catalogo de una sede,
 * que el bot envia -- y firmar todas contra el bucket de la conversacion dejaba sin enlace justo lo
 * que el bot acababa de mandar.
 *
 * Envuelve la pieza compartida para **conservar el comportamiento de este camino**: aqui un fallo
 * del almacen devuelve un mapa vacio, y la galeria se muestra con las filas sin enlace en vez de
 * caerse entera. El catalogo del bot y la multimedia de sede, en cambio, prefieren el error visible.
 */
export async function signMediaUrls(
  supabase: ReturnType<SupabaseServerClientFactory['create']>,
  targets: MediaSignatureTarget[]
): Promise<Map<string, string>> {
  try {
    const porBucket = new Map<string, string[]>();
    for (const target of targets) {
      const rutas = porBucket.get(target.bucket);
      if (rutas) rutas.push(target.path);
      else porBucket.set(target.bucket, [target.path]);
    }

    const firmadas = new Map<string, string>();
    for (const [bucket, paths] of porBucket) {
      const delBucket = await signMediaPaths({
        bucket,
        paths,
        signer: supabase,
        ttlSeconds: SIGNED_URL_TTL_SECONDS
      });
      for (const [path, url] of delBucket) firmadas.set(mediaSignatureKey(bucket, path), url);
    }
    return firmadas;
  } catch (error) {
    // Un fallo aqui no se silencia: se registra el motivo y cuantas rutas quedaron sin firmar.
    // La galeria se muestra con esas filas sin enlace, pero el fallo queda rastro para poder verlo.
    logger.warn(`No se pudieron firmar ${targets.length} rutas: ${String(error)}`);
    return new Map();
  }
}

/**
 * Lo que hay que firmar de una fila: su ruta y el bucket donde vive.
 *
 * Una fila sin copia propia -- una descarga que aun no se hizo -- no tiene destino, y se muestra sin
 * enlace. Una fila que si tiene ruta pero no declara bucket no se puede resolver: se registra, en
 * vez de firmarla contra un bucket inventado que devolveria un enlace que no corresponde a nada.
 */
function readSignatureTarget(row: PersistedAttachment): MediaSignatureTarget | null {
  const path = row.storage_object_path;
  if (typeof path !== 'string' || path.length === 0) return null;
  if (typeof row.bucket !== 'string' || row.bucket.length === 0) {
    logger.warn('Un adjunto con copia propia no declara su bucket: se muestra sin enlace.');
    return null;
  }
  return { bucket: row.bucket, path };
}

function readSignatureTargets(rows: PersistedAttachment[]): MediaSignatureTarget[] {
  return rows.flatMap((row) => {
    const target = readSignatureTarget(row);
    return target ? [target] : [];
  });
}

/**
 * Un objeto que no esta no es un fallo del almacen.
 *
 * `exists` devuelve `data: false` **con** el error del almacen cuando la respuesta es 400 o 404: son
 * los codigos con los que dice «esa ruta no existe». Cualquier otro fallo -- red, permisos, 5xx -- no
 * se puede confundir con una ausencia, porque entonces un almacen caido pareceria un archivo que
 * falta y el cliente recibiria un rechazo en lugar de un error del servidor.
 */
function isMissingObject(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const status = (error as { status?: unknown }).status;
  return status === 400 || status === 404;
}

function readContactName(conversation: unknown): { contactId: string; contactName: string } | null {
  const relation = Array.isArray(conversation) ? conversation[0] : conversation;
  if (!relation || typeof relation !== 'object') return null;
  const contact = (relation as { contact?: unknown }).contact;
  const contactRelation = Array.isArray(contact) ? contact[0] : contact;
  if (!contactRelation || typeof contactRelation !== 'object') return null;
  const displayName = (contactRelation as { display_name?: unknown }).display_name;
  const contactId = (relation as { contact_id?: unknown }).contact_id;
  if (typeof contactId !== 'string' || typeof displayName !== 'string') return null;
  return { contactId, contactName: displayName };
}

function normalizeTimestamp(value: unknown): string {
  if (typeof value !== 'string') {
    throw new InternalServerErrorException('El adjunto no tiene una fecha válida.');
  }
  const timestamp = new Date(value.replace(/([+-]\d{2})$/, '$1:00'));
  if (Number.isNaN(timestamp.getTime())) {
    throw new InternalServerErrorException('El adjunto no tiene una fecha válida.');
  }
  return timestamp.toISOString();
}

@Injectable()
export class ConversationMediaService {
  constructor(
    @Inject(RequestAuthenticator) private readonly requestAuthenticator: RequestAuthenticator,
    @Inject(TenantAccessService) private readonly tenantAccessService: TenantAccessService,
    @Inject(SupabaseServerClientFactory)
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  async list(
    authorization: unknown,
    tenantId: string,
    query: MediaListQuery
  ): Promise<MediaListResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);
    const supabase = this.supabaseServerClientFactory.create();

    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    let request = supabase
      .from('message_attachments')
      .select(mediaSelection)
      .eq('tenant_id', tenantId);

    if (query.kind) request = request.eq('kind', query.kind);

    if (query.search !== undefined) {
      // Se resuelve en dos pasos, igual que la búsqueda de la bandeja, para no depender de
      // filtros sobre relaciones anidadas.
      const term = sanitizeSearchTerm(query.search);
      if (!term) return mediaListResponseSchema.parse({ items: [], nextCursor: null });

      const { data: contacts, error: contactError } = await supabase
        .from('contacts')
        .select('id')
        .eq('tenant_id', tenantId)
        .ilike('display_name', `%${term}%`)
        .limit(SEARCH_CONTACT_LIMIT);
      if (contactError) {
        throw new InternalServerErrorException('No fue posible buscar la multimedia.');
      }
      const contactIds = (contacts ?? []).flatMap((contact) =>
        typeof contact.id === 'string' ? [contact.id] : []
      );
      if (contactIds.length === 0) {
        return mediaListResponseSchema.parse({ items: [], nextCursor: null });
      }

      const { data: conversations, error: conversationError } = await supabase
        .from('conversations')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('contact_id', contactIds);
      if (conversationError) {
        throw new InternalServerErrorException('No fue posible buscar la multimedia.');
      }
      const conversationIds = (conversations ?? []).flatMap((conversation) =>
        typeof conversation.id === 'string' ? [conversation.id] : []
      );
      if (conversationIds.length === 0) {
        return mediaListResponseSchema.parse({ items: [], nextCursor: null });
      }

      request = request.in('conversation_id', conversationIds);
    }

    if (query.cursor) {
      const cursor = decodeMediaCursor(query.cursor);
      if (!cursor) throw new BadRequestException('El cursor de multimedia no es válido.');
      request = request.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
      );
    }

    const { data, error } = await request
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);

    if (error) {
      throw new InternalServerErrorException('No fue posible cargar la multimedia.');
    }

    const rows = (data ?? []) as PersistedAttachment[];
    const page = rows.slice(0, limit);
    const signed = await signMediaUrls(supabase, readSignatureTargets(page));

    const items = page.map((row) => {
      const contact = readContactName(row.conversation);
      if (!contact) {
        throw new InternalServerErrorException('La conversación del adjunto no tiene contacto.');
      }
      const target = readSignatureTarget(row);
      return {
        contactId: contact.contactId,
        contactName: contact.contactName,
        contentType: typeof row.content_type === 'string' ? row.content_type : null,
        conversationId: row.conversation_id,
        createdAt: normalizeTimestamp(row.created_at),
        id: row.id,
        kind: row.kind as AttachmentKind,
        messageId: row.message_id,
        title: typeof row.source_title === 'string' ? row.source_title : null,
        url: target ? (signed.get(mediaSignatureKey(target.bucket, target.path)) ?? null) : null
      };
    });

    const last = page.at(-1);
    const nextCursor =
      rows.length > limit && last
        ? encodeMediaCursor({
            createdAt: normalizeTimestamp(last.created_at),
            id: String(last.id)
          })
        : null;

    return mediaListResponseSchema.parse({ items, nextCursor });
  }

  /**
   * Guarda el archivo que quien atiende adjunta a una conversacion.
   *
   * El tipo lo dicen los BYTES: el nombre y el MIME que declare el cliente no se miran. Se mide,
   * luego se reconoce y solo entonces se escribe, con la ruta que sale del hash -- asi un archivo
   * que no se admite no deja nada en el almacen, y subir dos veces el mismo archivo no duplica el
   * objeto. La respuesta no lleva ninguna ruta: solo un identificador opaco con el que enviarlo.
   */
  async upload(
    authorization: unknown,
    tenantId: string,
    conversationId: string,
    bytes: unknown
  ): Promise<ConversationMediaUploadResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);
    const supabase = this.supabaseServerClientFactory.create();

    // El archivo pertenece a UNA conversacion de ESTE espacio: el aislamiento no depende de la
    // interfaz, y se comprueba antes de medir o de escribir nada.
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', conversationId)
      .maybeSingle();
    if (conversationError)
      throw new InternalServerErrorException('No fue posible comprobar la conversación.');
    if (!conversation) throw new NotFoundException('La conversación no existe en este tenant.');

    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      throw new UnprocessableEntityException('Hace falta un archivo.');
    }
    if (bytes.length > MAX_UPLOAD_BYTES) {
      throw new UnprocessableEntityException('El archivo supera el límite de 25 MB.');
    }

    const recognized = recognizeMedia(bytes);
    const tipo = recognized ? outboundMediaTypeForExtension(recognized.extension) : null;
    if (!recognized || !tipo) {
      throw new UnprocessableEntityException(
        'El archivo no es una imagen, un vídeo ni un documento PDF: el tipo se reconoce por su contenido.'
      );
    }

    const uploadId = createHash('sha256').update(bytes).digest('hex');
    const path = conversationMediaPath({
      conversationId,
      extension: tipo.extension,
      tenantId,
      uploadId
    });
    const guardado = await supabaseMediaStorage(supabase).upload({
      bucket: MEDIA_BUCKET,
      bytes,
      contentType: recognized.contentType,
      path
    });
    if (!guardado) throw new InternalServerErrorException('No se pudo guardar el archivo.');

    return conversationMediaUploadResponseSchema.parse({
      byteSize: bytes.length,
      contentType: recognized.contentType,
      extension: tipo.extension,
      kind: tipo.kind,
      uploadId
    });
  }

  /**
   * Comprueba que una carga esta en el bucket de ESTA conversacion.
   *
   * Se pregunta al almacen por el objeto: un enlace firmado se puede construir para una ruta que no
   * existe, asi que deducir la existencia de la firma dejaria pasar un identificador inventado y el
   * mensaje saldria con un archivo que nadie puede descargar. Un objeto que no esta devuelve falso
   * -- un cliente que mienta sobre la extension apunta a una ruta inexistente --; un almacen que no
   * responde LANZA, porque no es lo mismo "no esta" que "no se pudo mirar", y confundirlos
   * convertiria un fallo del servidor en un rechazo del cliente.
   */
  async uploadedObjectExists(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    input: {
      conversationId: string;
      extension: OutboundMediaExtension;
      tenantId: string;
      uploadId: string;
    }
  ): Promise<boolean> {
    const path = conversationMediaPath(input);
    let resultado: { data: boolean; error: unknown };
    try {
      resultado = await supabase.storage.from(MEDIA_BUCKET).exists(path);
    } catch {
      throw new InternalServerErrorException('No fue posible comprobar el archivo.');
    }
    if (resultado.error && !isMissingObject(resultado.error)) {
      throw new InternalServerErrorException('No fue posible comprobar el archivo.');
    }
    return resultado.data === true;
  }
}
