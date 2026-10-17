import {
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException
} from '@nestjs/common';
import {
  conversationMessageListResponseSchema,
  conversationMessageSchema,
  createOutboundMessageResponseSchema,
  type ConversationMessage,
  type CreateOutboundMediaMessage,
  type MessageAttachment,
  type ConversationMessageListQuery,
  type ConversationMessageListResponse,
  type CreateOutboundMessage,
  type CreateOutboundMessageResponse
} from '@chat-zernio/contracts';
import {
  channelAcceptsOutboundAttachment,
  findWhatsappTemplateByReference,
  outboundAttachmentKindsFor,
  outboundMediaTypeForExtension,
  whatsappServiceWindow,
  whatsappTemplateReferenceFrom,
  whatsappTemplateSendability,
  type OutboundMediaType
} from '@chat-zernio/domain';
import { RequestAuthenticator } from '../auth/request-authenticator';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';
import { TenantAccessService } from '../tenants/tenant-access.service';
import { WhatsappTemplateCatalog } from '../zernio/whatsapp-template-catalog';
import {
  CONVERSATION_UPLOAD_SOURCE,
  MEDIA_BUCKET,
  conversationMediaPath,
  mediaSignatureKey,
  signMediaUrls,
  type MediaSignatureTarget,
  ConversationMediaService
} from './conversation-media.service';

const logger = new Logger('TenantMessage');

/**
 * Las columnas de un mensaje tal como lo devuelve la API.
 *
 * Una sola copia: la usan el historial, el alta del mensaje y su encolado, y las tres tienen que
 * traer lo mismo -- el adjunto con SU bucket incluido -- para que la respuesta sea la misma.
 */
const MESSAGE_SELECTION =
  'id, body, direction, sender_type, status, sent_at, created_at, source, comment_state, comment_private_reply_at, whatsapp_template_name, whatsapp_template_language, attachments:message_attachments(id, kind, content_type, bucket, storage_object_path, source_title)';

const IDEMPOTENCY_SELECTION =
  'id, body, direction, sender_type, status, sent_at, created_at, source, comment_state, comment_private_reply_at, conversation_id, whatsapp_template_name, whatsapp_template_language, attachments:message_attachments(id, kind, content_type, bucket, storage_object_path, source_title)';

/**
 * Un adjunto ya resuelto que va a acompanar al mensaje.
 *
 * `sourceKind` es la procedencia que se guarda en la fila -- el catalogo administrado de una sede o
 * la carga de quien atiende la conversacion --: quien puso el archivo ahi es un dato, no algo que se
 * adivine a partir del bucket donde vive.
 */
export type OutboundAttachment = {
  bucket: string;
  contentType: string | null;
  kind: string;
  path: string;
  sourceKind: string;
};

type PersistedAttachmentRow = {
  bucket?: unknown;
  content_type?: unknown;
  id?: unknown;
  kind?: unknown;
  source_title?: unknown;
  storage_object_path?: unknown;
};

type PersistedMessage = {
  attachments?: unknown;
  body: unknown;
  comment_private_reply_at?: unknown;
  comment_state?: unknown;
  created_at: unknown;
  direction: unknown;
  id: unknown;
  sender_type: unknown;
  sent_at: unknown;
  source?: unknown;
  status: unknown;
  whatsapp_template_language?: unknown;
  whatsapp_template_name?: unknown;
};

/**
 * Lo que se va a enviar, ya resuelto.
 *
 * El texto es la copia visible: para una plantilla no es la carga que viaja al proveedor —esa es la
 * referencia— sino lo que se guarda para que el historial muestre lo mismo que vio el cliente.
 */
type SendIntent = {
  body: string;
  whatsappTemplate: { language: string; name: string } | null;
};

function readWhatsappTemplateReference(message: PersistedMessage): {
  language: string;
  name: string;
} | null {
  return whatsappTemplateReferenceFrom(
    message.whatsapp_template_name,
    message.whatsapp_template_language
  );
}

function normalizeTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new InternalServerErrorException(`El mensaje no tiene ${field} válida.`);
  }
  const timestamp = new Date(value.replace(/([+-]\d{2})$/, '$1:00'));
  if (Number.isNaN(timestamp.getTime())) {
    throw new InternalServerErrorException(`El mensaje no tiene ${field} válida.`);
  }
  return timestamp.toISOString();
}

/**
 * Convierte la multimedia guardada en enlaces entregables. Una copia que no se pudo descargar
 * se entrega sin enlace: el mensaje sigue visible y nunca se pierde por un adjunto.
 */
function readAttachmentRows(message: PersistedMessage): unknown[] {
  return Array.isArray(message.attachments) ? message.attachments : [];
}

/** Las rutas y buckets que hay que firmar para este mensaje: cada adjunto, contra el suyo. */
function readAttachmentSignatureTargets(message: PersistedMessage): MediaSignatureTarget[] {
  return readAttachmentRows(message).flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const { bucket, storage_object_path: path } = row as PersistedAttachmentRow;
    if (typeof bucket !== 'string' || bucket.length === 0) return [];
    if (typeof path !== 'string' || path.length === 0) return [];
    return [{ bucket, path }];
  });
}

/**
 * Compara el adjunto que YA tiene el mensaje guardado con el que describe el comando.
 *
 * Se compara por bucket y ruta, que es la identidad del objeto: dos cargas distintas no pueden
 * compartir ninguna de las dos, y por eso la misma clave con otro archivo no pasa por aqui.
 */
function matchesAttachments(message: PersistedMessage, expected: OutboundAttachment[]): boolean {
  const guardados = readAttachmentSignatureTargets(message);
  if (guardados.length !== expected.length) return false;
  const guardadas = new Set(guardados.map(({ bucket, path }) => mediaSignatureKey(bucket, path)));
  return (
    guardadas.size === expected.length &&
    expected.every((adjunto) => guardadas.has(mediaSignatureKey(adjunto.bucket, adjunto.path)))
  );
}

/**
 * El adjunto que corresponde a un comando de archivo, sin tocar el almacen.
 *
 * La ruta es la misma que compuso la subida -- determinista a partir del hash -- y el tipo sale de
 * la extension que reconocieron los bytes. Poder componerlo sin leer nada es lo que permite comparar
 * una clave de idempotencia repetida cuando el objeto ya no esta.
 */
function attachmentForMediaCommand(input: {
  command: CreateOutboundMediaMessage;
  conversationId: string;
  tenantId: string;
  type: OutboundMediaType;
}): OutboundAttachment {
  return {
    bucket: MEDIA_BUCKET,
    contentType: input.type.contentType,
    kind: input.type.kind,
    path: conversationMediaPath({
      conversationId: input.conversationId,
      extension: input.type.extension,
      tenantId: input.tenantId,
      uploadId: input.command.uploadId
    }),
    sourceKind: CONVERSATION_UPLOAD_SOURCE
  };
}

/**
 * El adjunto que DEBE tener guardado un mensaje para que la misma clave siga siendo valida.
 *
 * Un comando de archivo describe su adjunto sin leer el almacen; cualquier otro comando describe los
 * adjuntos que trae quien llama -- el catalogo de la sede, que puede no traer ninguno.
 */
function expectedAttachmentsFor(input: {
  attachments: OutboundAttachment[] | undefined;
  command: CreateOutboundMessage;
  conversationId: string;
  tenantId: string;
}): OutboundAttachment[] {
  if (input.command.kind !== 'media') return input.attachments ?? [];
  const tipo = outboundMediaTypeForExtension(input.command.extension);
  if (!tipo) return [];
  return [
    attachmentForMediaCommand({
      command: input.command,
      conversationId: input.conversationId,
      tenantId: input.tenantId,
      type: tipo
    })
  ];
}

function readAttachments(
  message: PersistedMessage,
  signedUrls: Map<string, string>
): MessageAttachment[] {
  return readAttachmentRows(message).flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const attachment = row as PersistedAttachmentRow;
    if (typeof attachment.id !== 'string' || typeof attachment.kind !== 'string') return [];
    const path =
      typeof attachment.storage_object_path === 'string' ? attachment.storage_object_path : null;
    const bucket = typeof attachment.bucket === 'string' ? attachment.bucket : null;
    return [
      {
        contentType: typeof attachment.content_type === 'string' ? attachment.content_type : null,
        id: attachment.id,
        kind: attachment.kind as MessageAttachment['kind'],
        title: typeof attachment.source_title === 'string' ? attachment.source_title : null,
        url: path && bucket ? (signedUrls.get(mediaSignatureKey(bucket, path)) ?? null) : null
      }
    ];
  });
}

function asConversationMessage(
  message: PersistedMessage,
  signedUrls: Map<string, string>
): ConversationMessage {
  return conversationMessageSchema.parse({
    attachments: readAttachments(message, signedUrls),
    body: message.body,
    commentPrivateReplyAvailable:
      message.source === 'comment' ? message.comment_private_reply_at === null : undefined,
    commentState: message.source === 'comment' ? (message.comment_state ?? 'visible') : undefined,
    createdAt: normalizeTimestamp(message.created_at, 'fecha de creación'),
    direction: message.direction,
    id: message.id,
    senderType: message.sender_type,
    source: message.source,
    sentAt: message.sent_at === null ? null : normalizeTimestamp(message.sent_at, 'fecha de envío'),
    status: message.status,
    whatsappTemplate: readWhatsappTemplateReference(message)
  });
}

function hasZernioChannel(channel: unknown): boolean {
  const relation = Array.isArray(channel) ? channel[0] : channel;
  return Boolean(
    relation &&
      typeof relation === 'object' &&
      'provider' in relation &&
      relation.provider === 'zernio'
  );
}

/**
 * Un canal retirado no envia.
 *
 * Es la misma fila de `channel_accounts` —la historia se conserva a proposito—, pero su cuenta ya no
 * esta conectada en el proveedor. Enviar seria encolar un mensaje condenado.
 */
function isDisconnectedChannel(channel: unknown): boolean {
  const relation = Array.isArray(channel) ? channel[0] : channel;
  return Boolean(
    relation &&
      typeof relation === 'object' &&
      'disconnected_at' in relation &&
      typeof (relation as { disconnected_at?: unknown }).disconnected_at === 'string' &&
      (relation as { disconnected_at: string }).disconnected_at
  );
}

/** La plataforma la entrega el proveedor y se guarda tal cual: se compara normalizada. */
function isWhatsappChannel(channel: unknown): boolean {
  const relation = Array.isArray(channel) ? channel[0] : channel;
  if (!relation || typeof relation !== 'object' || !('platform' in relation)) return false;
  const platform = (relation as { platform?: unknown }).platform;
  return typeof platform === 'string' && platform.trim().toLowerCase() === 'whatsapp';
}

/** La plataforma del canal, para preguntar la capacidad de adjuntos que declara el dominio. */
function readChannelPlatform(channel: unknown): string | null {
  const relation = Array.isArray(channel) ? channel[0] : channel;
  if (!relation || typeof relation !== 'object' || !('platform' in relation)) return null;
  const platform = (relation as { platform?: unknown }).platform;
  return typeof platform === 'string' ? platform : null;
}

/** Como se nombra cada tipo de adjunto en el mensaje de error: el motivo tiene que ser legible. */
const ATTACHMENT_KIND_LABELS: Record<string, string> = {
  file: 'documentos',
  image: 'imágenes',
  video: 'vídeos'
};

/** «documentos, imágenes y vídeos»: lo que SI admite el canal, para que se vea que corregir. */
function describeAttachmentKinds(kinds: readonly string[]): string {
  const nombres = kinds.map((kind) => ATTACHMENT_KIND_LABELS[kind] ?? kind);
  if (nombres.length <= 1) return nombres.join('');
  return `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`;
}

@Injectable()
export class TenantMessageService {
  constructor(
    @Inject(RequestAuthenticator) private readonly requestAuthenticator: RequestAuthenticator,
    @Inject(TenantAccessService) private readonly tenantAccessService: TenantAccessService,
    @Inject(SupabaseServerClientFactory)
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory,
    @Inject(WhatsappTemplateCatalog)
    private readonly whatsappTemplateCatalog: WhatsappTemplateCatalog,
    @Inject(ConversationMediaService)
    private readonly conversationMediaService: ConversationMediaService
  ) {}

  async list(
    authorization: unknown,
    tenantId: string,
    conversationId: string,
    query: ConversationMessageListQuery
  ): Promise<ConversationMessageListResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);
    const supabase = this.supabaseServerClientFactory.create();
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', conversationId)
      .maybeSingle();
    if (conversationError)
      throw new InternalServerErrorException('No fue posible comprobar la conversación.');
    if (!conversation) throw new NotFoundException('La conversación no existe en este tenant.');

    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select(MESSAGE_SELECTION)
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversationId)
      // Se limita el historial por los mensajes mas recientes. Ordenar ascendente antes del limite
      // dejaba una conversacion larga congelada en sus primeros mensajes aunque ya tuviera actividad.
      .order('created_at', { ascending: false })
      .limit(query.limit);
    if (messagesError)
      throw new InternalServerErrorException('No fue posible cargar el historial.');
    // La pantalla se lee cronologicamente, asi que se devuelve el bloque reciente de nuevo en orden
    // ascendente. La consulta descendente es solo la forma correcta de aplicar el limite.
    const persistedMessages = [...((messages ?? []) as PersistedMessage[])].reverse();
    // Cada adjunto se firma contra SU bucket: el que subio la asesora y el que mando el bot desde el
    // catalogo de una sede no viven en el mismo sitio, y firmarlos todos contra uno dejaba sin enlace
    // justo la foto que el bot acababa de enviar.
    const signedUrls = await signMediaUrls(
      supabase,
      persistedMessages.flatMap((message) => readAttachmentSignatureTargets(message))
    );
    return conversationMessageListResponseSchema.parse({
      items: persistedMessages.map((message) => asConversationMessage(message, signedUrls)),
      nextCursor: null
    });
  }

  async createOutbound(
    authorization: unknown,
    tenantId: string,
    conversationId: string,
    command: CreateOutboundMessage
  ): Promise<CreateOutboundMessageResponse> {
    const identity = await this.requestAuthenticator.authenticate(authorization);
    await this.tenantAccessService.assertMembership(identity.userId, tenantId);
    return this.enqueueOutbound({
      command,
      conversationId,
      senderType: 'agent',
      senderUserId: identity.userId,
      tenantId
    });
  }

  /**
   * Nucleo del envio saliente.
   *
   * Lo comparten la interfaz —donde quien escribe es la asesora y hay sesion— y las herramientas del
   * bot, donde quien escribe es la automatizacion y no hay sesion de nadie. Todo lo demas es igual:
   * la comprobacion del canal, la idempotencia y el encolado para que el trabajador lo entregue.
   *
   * `attachments` son los adjuntos YA resueltos de quien llama -- el catalogo de una sede, que elige
   * el bot y no depende del canal. Un comando con archivo propio (`kind: 'media'`) no los usa: su
   * carga se resuelve aqui, porque es aqui donde se sabe que canal la va a llevar.
   */
  async enqueueOutbound(context: {
    attachments?: OutboundAttachment[];
    command: CreateOutboundMessage;
    conversationId: string;
    senderType: 'agent' | 'automation';
    senderUserId: string | null;
    tenantId: string;
  }): Promise<CreateOutboundMessageResponse> {
    const { attachments, command, conversationId, senderType, senderUserId, tenantId } = context;
    const supabase = this.supabaseServerClientFactory.create();
    const { data: conversation, error: conversationError } = await supabase
      .from('conversations')
      .select(
        'id, channel_account_id, channel_account:channel_accounts(provider, platform, disconnected_at)'
      )
      .eq('tenant_id', tenantId)
      .eq('id', conversationId)
      .maybeSingle();
    if (conversationError)
      throw new InternalServerErrorException('No fue posible comprobar la conversación.');
    if (!conversation) throw new NotFoundException('La conversación no existe en este tenant.');
    if (!conversation.channel_account_id || !hasZernioChannel(conversation.channel_account)) {
      throw new UnprocessableEntityException(
        'La conversación no tiene un canal Zernio listo para enviar.'
      );
    }
    // Un canal retirado no envia. Se dice con su motivo en lugar de intentarlo contra una cuenta que
    // el proveedor ya no tiene conectada: el mensaje quedaria fallido minutos despues y sin contexto.
    if (isDisconnectedChannel(conversation.channel_account)) {
      throw new UnprocessableEntityException(
        'El canal de esta conversación está retirado: reconéctalo para poder responder.'
      );
    }

    // Fuera de la ventana de 24 horas, WhatsApp solo admite plantillas aprobadas. La regla vive aqui,
    // en el camino compartido, para que valga igual para una persona en la bandeja y para el bot: si
    // estuviera solo en la puerta del bot, la bandeja seguiria encolando mensajes que Meta rechaza.
    await this.assertMessagingWindow(
      supabase,
      tenantId,
      conversationId,
      command,
      conversation.channel_account
    );

    // La idempotencia se comprueba ANTES de resolver el adjunto: repetir una clave no puede depender
    // de que el archivo siga en el almacen, o un reintento tardio dejaria de devolver lo ya guardado.
    const existing = await this.findByIdempotencyKey(supabase, tenantId, command.idempotencyKey);
    if (existing) {
      return this.resolveIdempotentResult(supabase, {
        attachments,
        command,
        conversationId,
        existing,
        tenantId
      });
    }

    const adjuntos = await this.resolveOutboundAttachments({
      attachments,
      channelAccount: conversation.channel_account,
      command,
      conversationId,
      supabase,
      tenantId
    });

    // Lo que se va a enviar se resuelve ANTES de insertar: una plantilla que no pertenece a esta
    // cuenta, o que exige valores, no puede dejar un mensaje a medias en el historial.
    const intent = await this.resolveSendIntent(tenantId, conversation.channel_account_id, command);

    const { data: created, error: createError } = await supabase
      .from('messages')
      .insert({
        body: intent.body,
        channel_account_id: conversation.channel_account_id,
        conversation_id: conversationId,
        direction: 'outbound',
        idempotency_key: command.idempotencyKey,
        sender_type: senderType,
        sender_user_id: senderUserId,
        sent_at: new Date().toISOString(),
        // Con adjunto, el mensaje nace en borrador y solo pasa a la cola cuando su archivo ya esta
        // escrito: el disparador crea el evento de envio al quedar en cola, y mientras tanto el
        // trabajador no puede tomar un mensaje al que todavia le falta el archivo. Sin adjunto, la
        // escritura es la de siempre.
        status: adjuntos.length > 0 ? 'draft' : 'queued',
        tenant_id: tenantId,
        whatsapp_template_language: intent.whatsappTemplate?.language ?? null,
        whatsapp_template_name: intent.whatsappTemplate?.name ?? null
      })
      .select(MESSAGE_SELECTION)
      .maybeSingle();
    if (!createError && created) {
      return this.finishOutbound({
        adjuntos,
        conversationId,
        created: created as PersistedMessage,
        supabase,
        tenantId
      });
    }
    if (createError?.code === '23505') {
      const raced = await this.findByIdempotencyKey(supabase, tenantId, command.idempotencyKey);
      if (raced) {
        return this.resolveIdempotentResult(supabase, {
          attachments,
          command,
          conversationId,
          existing: raced,
          tenantId
        });
      }
    }
    throw new InternalServerErrorException('No fue posible preparar el mensaje para envío.');
  }

  /**
   * Escribe el mensaje y, si lleva adjunto, lo deja completo ANTES de que exista el evento de envio.
   *
   * El orden es la regla. El mensaje se inserto en `draft`, asi que todavia no hay evento; se escribe
   * la fila del adjunto y solo entonces el mensaje pasa a `queued`, que es lo que hace nacer el
   * evento. El trabajador no puede tomar entre las dos escrituras un mensaje sin su archivo.
   *
   * Si algo falla despues de insertar el mensaje, el borrador se retira -- y con el, en cascada, sus
   * adjuntos --: no queda un mensaje a medias en el historial ni nada en la cola.
   */
  private async finishOutbound(input: {
    adjuntos: OutboundAttachment[];
    conversationId: string;
    created: PersistedMessage;
    supabase: ReturnType<SupabaseServerClientFactory['create']>;
    tenantId: string;
  }): Promise<CreateOutboundMessageResponse> {
    const { adjuntos, conversationId, created, supabase, tenantId } = input;
    if (adjuntos.length === 0) {
      return createOutboundMessageResponseSchema.parse({
        item: asConversationMessage(created, new Map())
      });
    }

    const messageId = typeof created.id === 'string' ? created.id : null;
    if (!messageId) throw new InternalServerErrorException('No fue posible preparar el mensaje.');

    const { error: attachmentError } = await supabase.from('message_attachments').insert(
      adjuntos.map((adjunto, ordinal) => ({
        bucket: adjunto.bucket,
        content_type: adjunto.contentType,
        conversation_id: conversationId,
        kind: adjunto.kind,
        message_id: messageId,
        ordinal,
        source_kind: adjunto.sourceKind,
        storage_object_path: adjunto.path,
        tenant_id: tenantId
      }))
    );
    if (attachmentError) {
      await this.discardDraft(supabase, tenantId, messageId);
      throw new InternalServerErrorException('No fue posible guardar el archivo del mensaje.');
    }

    const { data: queued, error: queueError } = await supabase
      .from('messages')
      .update({ status: 'queued' })
      .eq('tenant_id', tenantId)
      .eq('id', messageId)
      .eq('status', 'draft')
      .select(MESSAGE_SELECTION)
      .maybeSingle();
    if (queueError || !queued) {
      await this.discardDraft(supabase, tenantId, messageId);
      throw new InternalServerErrorException('No fue posible encolar el mensaje con su archivo.');
    }

    return this.respond(supabase, queued as PersistedMessage);
  }

  /**
   * Retira el mensaje en borrador que no llego a completarse.
   *
   * Se filtra por `draft` a proposito: si el mensaje ya llego a la cola -- el evento existe y su
   * archivo esta escrito -- no se borra nada, porque ese mensaje esta bien y lo unico que fallo fue
   * la respuesta. Un borrador que no se pudo retirar se registra: es la unica forma de saber que
   * quedo una fila sin evento.
   */
  private async discardDraft(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    messageId: string
  ): Promise<void> {
    const { error } = await supabase
      .from('messages')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', messageId)
      .eq('status', 'draft');
    if (error) {
      logger.error(
        `No se pudo retirar el mensaje en borrador ${messageId} de ${tenantId}: ${String(error)}`
      );
    }
  }

  /**
   * Los adjuntos de este envio.
   *
   * El catalogo de la sede llega ya resuelto: lo elige quien llama y no depende del canal. Un comando
   * con archivo propio, en cambio, se resuelve aqui: el tipo sale de la extension que reconocieron
   * los bytes, el canal decide si lo admite -- un documento a un canal que no lo lleva se rechaza con
   * su motivo, en vez de encolar un mensaje que el proveedor va a tirar -- y la existencia del objeto
   * se comprueba firmando su ruta determinista.
   */
  private async resolveOutboundAttachments(input: {
    attachments?: OutboundAttachment[];
    channelAccount: unknown;
    command: CreateOutboundMessage;
    conversationId: string;
    supabase: ReturnType<SupabaseServerClientFactory['create']>;
    tenantId: string;
  }): Promise<OutboundAttachment[]> {
    if (input.command.kind !== 'media') return input.attachments ?? [];

    const tipo = outboundMediaTypeForExtension(input.command.extension);
    if (!tipo) {
      throw new UnprocessableEntityException('Ese tipo de archivo no se puede adjuntar.');
    }
    const plataforma = readChannelPlatform(input.channelAccount);
    if (!channelAcceptsOutboundAttachment(plataforma, tipo.kind)) {
      throw new UnprocessableEntityException(
        `Este canal solo admite ${describeAttachmentKinds(outboundAttachmentKindsFor(plataforma))}: el archivo elegido no se puede enviar.`
      );
    }

    const esperado = attachmentForMediaCommand({
      command: input.command,
      conversationId: input.conversationId,
      tenantId: input.tenantId,
      type: tipo
    });
    const existe = await this.conversationMediaService.uploadedObjectExists(input.supabase, {
      conversationId: input.conversationId,
      extension: tipo.extension,
      tenantId: input.tenantId,
      uploadId: input.command.uploadId
    });
    if (!existe) {
      throw new UnprocessableEntityException(
        'El archivo que quieres enviar ya no está disponible: vuelve a adjuntarlo.'
      );
    }
    return [esperado];
  }

  /**
   * La respuesta de un mensaje, con sus adjuntos ya firmados -- cada bucket contra el suyo -- para
   * que la interfaz los muestre en el acto.
   *
   * Un fallo del almacen no la tumba: `signMediaUrls` devuelve un mapa vacio y la respuesta sale con
   * los adjuntos sin enlace. El mensaje ya esta encolado; perderlo por no poder pintarlo seria peor.
   */
  private async respond(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    message: PersistedMessage
  ): Promise<CreateOutboundMessageResponse> {
    const signedUrls = await signMediaUrls(supabase, readAttachmentSignatureTargets(message));
    return createOutboundMessageResponseSchema.parse({
      item: asConversationMessage(message, signedUrls)
    });
  }

  /**
   * Fuera de la ventana de 24 horas, WhatsApp solo admite plantillas aprobadas.
   *
   * Se aplica a todo lo que no sea plantilla: un texto o una foto fuera de plazo tambien los rechaza
   * Meta, y ese rechazo llega minutos despues como un mensaje fallido. Fallar aqui es inmediato y
   * operable.
   *
   * No se bloquea cuando la ventana no se puede afirmar (otro canal, o un hilo sin mensajes
   * entrantes registrados): en ese caso decide el proveedor, que es quien tiene la ultima palabra.
   */
  private async assertMessagingWindow(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    conversationId: string,
    command: CreateOutboundMessage,
    channelAccount: unknown
  ): Promise<void> {
    // Una plantilla aprobada es justo lo que se puede enviar siempre: no se le aplica la ventana.
    if (command.kind === 'whatsapp_template') return;
    if (!isWhatsappChannel(channelAccount)) return;

    const { data: entrante, error } = await supabase
      .from('messages')
      .select('created_at')
      .eq('tenant_id', tenantId)
      .eq('conversation_id', conversationId)
      .eq('direction', 'inbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException('No fue posible comprobar la ventana de mensajería.');
    }

    const ventana = whatsappServiceWindow(
      typeof entrante?.created_at === 'string' ? entrante.created_at : null,
      Date.now()
    );
    if (ventana && !ventana.open) {
      throw new UnprocessableEntityException(
        `La ventana de 24 horas de WhatsApp está cerrada desde ${ventana.expiresAt}: envía una plantilla aprobada, o espera a que el cliente escriba.`
      );
    }
  }

  private async findByIdempotencyKey(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    tenantId: string,
    idempotencyKey: string
  ): Promise<(PersistedMessage & { conversation_id: string }) | null> {
    const { data, error } = await supabase
      .from('messages')
      .select(IDEMPOTENCY_SELECTION)
      .eq('tenant_id', tenantId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (error)
      throw new InternalServerErrorException(
        'No fue posible comprobar la idempotencia del mensaje.'
      );
    return (data as (PersistedMessage & { conversation_id: string }) | null) ?? null;
  }

  /**
   * Traduce el comando a lo que se guarda y se despacha.
   *
   * Para un texto es el propio texto. Para una plantilla hay que comprobar que pertenece al catalogo
   * de ESA cuenta y que se puede enviar: si no, se rechaza aqui y no se encola nada. La copia visible
   * la escribe el servidor desde la definicion aprobada; lo que viaja al proveedor es la referencia.
   */
  private async resolveSendIntent(
    tenantId: string,
    channelAccountId: string,
    command: CreateOutboundMessage
  ): Promise<SendIntent> {
    if (command.kind !== 'whatsapp_template') return { body: command.body, whatsappTemplate: null };

    const catalogo = await this.whatsappTemplateCatalog.readForChannelAccount(
      tenantId,
      channelAccountId
    );
    if (!catalogo) {
      throw new UnprocessableEntityException(
        'La conversación no tiene una cuenta de WhatsApp lista para enviar.'
      );
    }

    const plantilla = findWhatsappTemplateByReference(catalogo.templates, command.whatsappTemplate);
    if (!plantilla) {
      throw new UnprocessableEntityException(
        'Esa plantilla no está aprobada en la cuenta de WhatsApp de esta conversación.'
      );
    }

    const envio = whatsappTemplateSendability(plantilla);
    if (!envio.sendable) {
      throw new UnprocessableEntityException(
        envio.reason === 'not_approved'
          ? 'Meta todavía no tiene aprobada esa plantilla.'
          : envio.reason === 'missing_language'
            ? 'Meta no informó el idioma de esa plantilla, así que no se puede resolver.'
            : `Esa plantilla necesita valores para ${plantilla.variables.join(', ')} y este envío no los captura.`
      );
    }

    return {
      body: plantilla.previewText,
      whatsappTemplate: { language: command.whatsappTemplate.language, name: plantilla.name }
    };
  }

  /**
   * Compara un mensaje ya guardado con el comando recibido.
   *
   * Una clave de idempotencia repetida solo es valida si describe el MISMO envio: mismo destino,
   * misma carga y mismo adjunto. El adjunto se compara por el objeto que declara -- bucket y ruta --,
   * asi que la misma clave con otro archivo es un conflicto y no un mensaje con el archivo equivocado.
   *
   * Todo se compara contra lo guardado —referencia y adjunto incluidos— y no contra el catalogo ni
   * contra el almacen, para que un reintento no dependa de una lectura al proveedor.
   */
  private matchesCommand(
    existing: PersistedMessage & { conversation_id: string },
    tenantId: string,
    conversationId: string,
    command: CreateOutboundMessage,
    attachments: OutboundAttachment[] | undefined
  ): boolean {
    if (existing.conversation_id !== conversationId || existing.direction !== 'outbound') {
      return false;
    }
    const referencia = readWhatsappTemplateReference(existing);
    if (command.kind === 'whatsapp_template') {
      return (
        referencia?.name === command.whatsappTemplate.name &&
        referencia.language === command.whatsappTemplate.language
      );
    }

    const esperados = expectedAttachmentsFor({
      attachments,
      command,
      conversationId,
      tenantId
    });

    // Un comando con archivo cuya extension no se admite no describe ningun envio valido: no puede
    // coincidir con nada, ni siquiera con un mensaje de solo texto.
    if (command.kind === 'media' && esperados.length === 0) return false;
    return (
      referencia === null &&
      existing.body === command.body &&
      matchesAttachments(existing, esperados)
    );
  }

  private async resolveIdempotentResult(
    supabase: ReturnType<SupabaseServerClientFactory['create']>,
    input: {
      attachments: OutboundAttachment[] | undefined;
      command: CreateOutboundMessage;
      conversationId: string;
      existing: PersistedMessage & { conversation_id: string };
      tenantId: string;
    }
  ): Promise<CreateOutboundMessageResponse> {
    const { attachments, command, conversationId, existing, tenantId } = input;
    if (!this.matchesCommand(existing, tenantId, conversationId, command, attachments)) {
      throw new ConflictException('La clave de idempotencia ya fue usada para otro mensaje.');
    }
    return this.respond(supabase, existing);
  }
}
