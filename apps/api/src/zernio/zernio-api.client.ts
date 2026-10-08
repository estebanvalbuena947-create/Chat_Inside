import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException
} from '@nestjs/common';
import type { WhatsappTemplate, ZernioConnectPlatform } from '@chat-zernio/contracts';

type ZernioProfileResponse = {
  _id?: unknown;
  details?: { existingProfileId?: unknown };
};

type ZernioConnectResponse = {
  authUrl?: unknown;
};

export type ZernioAccount = {
  displayName: string | null;
  platform: string | null;
  profileId: string | null;
  username: string | null;
};

export type ZernioConversionEvent = {
  actionSource?: 'app' | 'crm' | 'offline' | 'phone_call' | 'system_generated' | 'web';
  currency?: string;
  eventId: string;
  eventName: string;
  /** En segundos Unix, no milisegundos. */
  eventTime: number;
  sourceUrl?: string;
  user: {
    city?: string;
    clickIds?: { fbc?: string; fbp?: string };
    country?: string;
    dob?: string;
    email?: string;
    externalId?: string;
    firstName?: string;
    gender?: 'f' | 'm';
    ipAddress?: string;
    lastName?: string;
    leadId?: string;
    phone?: string;
    state?: string;
    userAgent?: string;
    zip?: string;
  };
  value?: number;
};

export type ZernioConversionsResult = {
  eventsFailed: number;
  eventsReceived: number;
  failures: Array<{ code?: unknown; eventId: string; eventIndex: number; message: string }>;
  platform: string;
  traceId: string | null;
};

export type ZernioConversionDestination = {
  id: string;
  name: string;
  status: string | null;
  type: string | null;
};

function readField(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : null;
}

function readText(value: unknown, key: string): string | null {
  const field = readField(value, key);
  return typeof field === 'string' && field.trim() ? field : null;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ServiceUnavailableException(message);
  }
  return value.trim();
}

/**
 * Traduce el fallo del proveedor conservando su motivo: no es lo mismo un permiso que se nego que un
 * comentario que ya no existe, y quien lo lee merece saber cual de los dos es.
 */
function commentErrorFrom(status: number, payload: unknown): Error {
  const mensaje = readText(payload, 'error') ?? 'Zernio rechazo la operacion sobre el comentario.';
  if (status === 403) return new ForbiddenException(mensaje);
  if (status === 400 || status === 404 || status === 422) return new BadRequestException(mensaje);
  return new ServiceUnavailableException(mensaje);
}

/** Un 403 de conversiones indica que la cuenta no tiene habilitado el add-on de anuncios. */
function conversionsErrorFrom(status: number, payload: unknown): Error {
  const mensaje = readText(payload, 'error') ?? 'Zernio rechazo el envio de conversiones.';
  if (status === 403) return new ForbiddenException(mensaje);
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return new BadRequestException(mensaje);
  }
  return new ServiceUnavailableException(mensaje);
}

/** Un fallo al leer plantillas conserva el motivo del proveedor: casi siempre es la cuenta o sus permisos. */
function whatsappTemplatesErrorFrom(status: number, payload: unknown): Error {
  const mensaje = readText(payload, 'error') ?? 'Zernio rechazo la consulta de plantillas.';
  if (status === 400 || status === 404 || status === 422) return new BadRequestException(mensaje);
  return new ServiceUnavailableException(mensaje);
}

/**
 * Lectura tolerante de las plantillas.
 *
 * Se toma solo lo que el contrato necesita y se ignora el resto: el proveedor puede agregar campos
 * sin avisar, y eso no puede romper la pantalla. Una plantilla sin nombre se descarta, porque sin
 * nombre no hay nada que mostrar ni que enviar.
 *
 * De la definicion se conservan dos cosas mas, ambas derivadas del proveedor y no inventadas:
 * el texto visible (encabezado, cuerpo, pie y botones) y los huecos `{{...}}` que declares en
 * cualquier componente. Un hueco en un boton cuenta igual que uno en el cuerpo: si hay que
 * rellenarlo, la plantilla no se puede enviar sin valores.
 */
const TEMPLATE_PLACEHOLDER = /\{\{[^{}]*\}\}/g;

function collectTexts(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectTexts(item, out);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) collectTexts(item, out);
  }
}

function readWhatsappTemplateVariables(components: unknown): string[] {
  if (!Array.isArray(components)) return [];
  const textos: string[] = [];
  collectTexts(components, textos);
  const encontrados = new Set<string>();
  for (const texto of textos) {
    for (const coincidencia of texto.matchAll(TEMPLATE_PLACEHOLDER)) {
      encontrados.add(coincidencia[0].slice(0, 120));
    }
  }
  return [...encontrados];
}

/** Copia visible: el texto tal como lo vera quien confirme el envio. */
function readWhatsappTemplatePreview(components: unknown): string {
  if (!Array.isArray(components)) return '';
  const partes: string[] = [];
  for (const componente of components) {
    if (!componente || typeof componente !== 'object') continue;
    const fila = componente as { text?: unknown; type?: unknown };
    const tipo = typeof fila.type === 'string' ? fila.type : '';
    if (tipo !== 'HEADER' && tipo !== 'BODY' && tipo !== 'FOOTER') continue;
    if (typeof fila.text === 'string' && fila.text.trim()) partes.push(fila.text.trim());
  }
  return partes.join('\n').slice(0, 4000);
}

function readWhatsappTemplates(payload: unknown): WhatsappTemplate[] {
  const lista = (payload as { templates?: unknown } | null)?.templates;
  if (!Array.isArray(lista)) return [];

  const plantillas: WhatsappTemplate[] = [];
  for (const cruda of lista) {
    if (!cruda || typeof cruda !== 'object') continue;
    const fila = cruda as Record<string, unknown>;
    const name = typeof fila.name === 'string' ? fila.name.trim() : '';
    if (!name) continue;
    plantillas.push({
      category: typeof fila.category === 'string' ? fila.category : null,
      language: typeof fila.language === 'string' ? fila.language : null,
      name,
      previewText: readWhatsappTemplatePreview(fila.components),
      status: typeof fila.status === 'string' ? fila.status : null,
      variables: readWhatsappTemplateVariables(fila.components)
    });
  }
  return plantillas;
}

@Injectable()
export class ZernioApiClient {
  async createProfile(input: { idempotencyKey: string; name: string }): Promise<string> {
    const response = await this.request('/v1/profiles', {
      body: JSON.stringify({ name: input.name }),
      headers: { 'Idempotency-Key': input.idempotencyKey },
      method: 'POST'
    });
    const payload = (await response.json().catch(() => ({}))) as ZernioProfileResponse;

    if (response.status === 409) {
      return requireString(
        payload.details?.existingProfileId,
        'Zernio no devolvió el perfil existente.'
      );
    }
    if (!response.ok) {
      throw new ServiceUnavailableException('No fue posible preparar la conexión con Zernio.');
    }
    return requireString(payload._id, 'Zernio no devolvió el perfil creado.');
  }

  async getConnectUrl(input: {
    platform: ZernioConnectPlatform;
    profileId: string;
    redirectUrl: string;
  }): Promise<string> {
    const query = new URLSearchParams({
      profileId: input.profileId,
      redirect_url: input.redirectUrl
    });
    const response = await this.request(`/v1/connect/${input.platform}?${query.toString()}`, {
      method: 'GET'
    });
    const payload = (await response.json().catch(() => ({}))) as ZernioConnectResponse;
    if (!response.ok) {
      throw new ServiceUnavailableException('No fue posible iniciar la conexión con Zernio.');
    }
    const authorizationUrl = requireString(
      payload.authUrl,
      'Zernio no devolvió la autorización de la plataforma.'
    );
    try {
      new URL(authorizationUrl);
      return authorizationUrl;
    } catch {
      throw new ServiceUnavailableException('Zernio devolvió una autorización no válida.');
    }
  }

  /**
   * Busca una cuenta conectada en Zernio por su identificador.
   *
   * La clave de Zernio ve las cuentas de todos sus perfiles, asi que quien llama debe comprobar
   * el perfil: encontrar la cuenta no basta para registrarla.
   */
  async findAccount(accountId: string): Promise<ZernioAccount | null> {
    const response = await this.request('/v1/accounts', { method: 'GET' });
    if (!response.ok) {
      throw new ServiceUnavailableException('No fue posible consultar las cuentas de Zernio.');
    }
    const payload = (await response.json().catch(() => ({}))) as { accounts?: unknown };
    const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
    const found = accounts.find((item) => readText(item, '_id') === accountId);
    if (!found) return null;

    return {
      displayName: readText(found, 'displayName') ?? readText(found, 'username'),
      platform: readText(found, 'platform'),
      profileId: readText(readField(found, 'profileId'), '_id') ?? readText(found, 'profileId'),
      username: readText(found, 'username')
    };
  }
  /**
   * Acciones sobre comentarios. Contrato leido en docs.zernio.com; ver
   * specs/020-acciones-sobre-comentarios.md.
   *
   * Estas funciones ejecutan, no deciden: que se puede hacer con cada comentario lo resuelve la
   * regla de dominio a partir de lo que el proveedor informa.
   */
  async hideComment(input: {
    accountId: string;
    commentId: string;
    postId: string;
  }): Promise<void> {
    await this.commentAction(
      'POST',
      `/v1/inbox/comments/${encodeURIComponent(input.postId)}/${encodeURIComponent(input.commentId)}/hide`,
      { body: JSON.stringify({ accountId: input.accountId }) }
    );
  }

  async unhideComment(input: {
    accountId: string;
    commentId: string;
    postId: string;
  }): Promise<void> {
    const query = new URLSearchParams({ accountId: input.accountId });
    await this.commentAction(
      'DELETE',
      `/v1/inbox/comments/${encodeURIComponent(input.postId)}/${encodeURIComponent(input.commentId)}/hide?${query.toString()}`,
      {}
    );
  }

  async deleteComment(input: {
    accountId: string;
    commentId: string;
    postId: string;
  }): Promise<void> {
    const query = new URLSearchParams({ accountId: input.accountId, commentId: input.commentId });
    await this.commentAction(
      'DELETE',
      `/v1/inbox/comments/${encodeURIComponent(input.postId)}?${query.toString()}`,
      {}
    );
  }

  /**
   * Responde en publico. La clave de idempotencia evita publicar dos veces si el bot reintenta:
   * Zernio conserva la clave 24 horas y reproduce la respuesta original.
   */
  async replyToComment(input: {
    accountId: string;
    commentId: string;
    idempotencyKey: string;
    message: string;
    postId: string;
  }): Promise<{ commentId: string }> {
    const response = await this.request(`/v1/inbox/comments/${encodeURIComponent(input.postId)}`, {
      body: JSON.stringify({
        accountId: input.accountId,
        commentId: input.commentId,
        message: input.message
      }),
      headers: { 'Idempotency-Key': input.idempotencyKey },
      method: 'POST'
    });
    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) throw commentErrorFrom(response.status, payload);
    return {
      commentId: requireString(
        readField(readField(payload, 'data'), 'commentId'),
        'Zernio no devolvio el identificador de la respuesta publicada.'
      )
    };
  }

  /**
   * Responde en privado. Es un recurso de un solo uso: si ya se gasto, Zernio lo dice en
   * details.privateReplyConsumed y no se debe reintentar.
   */
  async sendPrivateReply(input: {
    accountId: string;
    commentId: string;
    message: string;
    postId: string;
  }): Promise<{ messageId: string }> {
    const response = await this.request(
      `/v1/inbox/comments/${encodeURIComponent(input.postId)}/${encodeURIComponent(input.commentId)}/private-reply`,
      {
        body: JSON.stringify({ accountId: input.accountId, message: input.message }),
        method: 'POST'
      }
    );
    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) {
      if (readField(readField(payload, 'details'), 'privateReplyConsumed') === true) {
        throw new BadRequestException(
          'La respuesta privada de este comentario ya se envio: solo se permite una.'
        );
      }
      throw commentErrorFrom(response.status, payload);
    }
    return {
      messageId: requireString(
        readField(payload, 'messageId'),
        'Zernio no devolvio el identificador del mensaje privado.'
      )
    };
  }

  /** Valida el add-on y lista los Pixels/Datasets disponibles antes de una activacion. */
  async listConversionDestinations(accountId: string): Promise<ZernioConversionDestination[]> {
    const response = await this.request(
      `/v1/accounts/${encodeURIComponent(accountId)}/conversion-destinations`,
      { method: 'GET' }
    );
    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) throw conversionsErrorFrom(response.status, payload);
    const destinations = readField(payload, 'destinations');
    return (Array.isArray(destinations) ? destinations : []).map((item) => ({
      id: requireString(readField(item, 'id'), 'Zernio devolvio un destino sin identificador.'),
      name: readText(item, 'name') ?? '',
      status: readText(item, 'status'),
      type: readText(item, 'type')
    }));
  }

  /** Devuelve los fallos parciales: Meta puede rechazar eventos aunque Zernio responda 200. */
  async sendConversions(input: {
    accountId: string;
    consent?: { adPersonalization?: 'DENIED' | 'GRANTED'; adUserData?: 'DENIED' | 'GRANTED' };
    destinationId: string;
    events: ZernioConversionEvent[];
    testCode?: string;
  }): Promise<ZernioConversionsResult> {
    const body: Record<string, unknown> = {
      accountId: input.accountId,
      destinationId: input.destinationId,
      events: input.events
    };
    if (input.testCode) body.testCode = input.testCode;
    if (input.consent) body.consent = input.consent;

    const response = await this.request('/v1/ads/conversions', {
      body: JSON.stringify(body),
      method: 'POST'
    });
    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) throw conversionsErrorFrom(response.status, payload);

    const failures = readField(payload, 'failures');
    return {
      eventsFailed: Number(readField(payload, 'eventsFailed') ?? 0),
      eventsReceived: Number(readField(payload, 'eventsReceived') ?? 0),
      failures: (Array.isArray(failures) ? failures : []).map((item) => ({
        code: readField(item, 'code'),
        eventId: readText(item, 'eventId') ?? '',
        eventIndex: Number(readField(item, 'eventIndex') ?? 0),
        message: readText(item, 'message') ?? ''
      })),
      platform: readText(payload, 'platform') ?? 'metaads',
      traceId: readText(payload, 'traceId')
    };
  }

  /** Consulta la calidad de coincidencia sin exponer identificadores de personas. */
  async getConversionsQuality(input: { accountId: string; destinationId: string }): Promise<
    Array<{
      compositeScore: number | null;
      eventCoveragePercentage: number | null;
      eventName: string;
      matchKeys: Array<{ coveragePercentage: number | null; identifier: string }>;
    }>
  > {
    const query = new URLSearchParams({
      accountId: input.accountId,
      destinationId: input.destinationId
    });
    const response = await this.request(`/v1/ads/conversions/quality?${query.toString()}`, {
      method: 'GET'
    });
    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) throw conversionsErrorFrom(response.status, payload);
    const rows = readField(payload, 'rows');
    return (Array.isArray(rows) ? rows : []).map((row) => {
      const matchKeys = readField(row, 'matchKeys');
      return {
        compositeScore:
          readField(row, 'compositeScore') === null
            ? null
            : Number(readField(row, 'compositeScore')),
        eventCoveragePercentage:
          readField(row, 'eventCoveragePercentage') === null
            ? null
            : Number(readField(row, 'eventCoveragePercentage')),
        eventName: readText(row, 'eventName') ?? '',
        matchKeys: (Array.isArray(matchKeys) ? matchKeys : []).map((matchKey) => ({
          coveragePercentage:
            readField(matchKey, 'coveragePercentage') === null
              ? null
              : Number(readField(matchKey, 'coveragePercentage')),
          identifier: readText(matchKey, 'identifier') ?? ''
        }))
      };
    });
  }

  private async commentAction(
    method: 'DELETE' | 'POST',
    path: string,
    init: { body?: string }
  ): Promise<void> {
    const response = await this.request(path, { ...init, method });
    if (response.ok) return;
    const payload = (await response.json().catch(() => ({}))) as unknown;
    throw commentErrorFrom(response.status, payload);
  }
  /**
   * Plantillas aprobadas de WhatsApp de una cuenta.
   *
   * El proveedor resuelve la plantilla por nombre e idioma exactos antes de enviarla, asi que lo que
   * se lista aqui es exactamente lo que se puede enviar desde ESA cuenta. Quien agrupa varias
   * cuentas del espacio es el catalogo, que es quien sabe a cual pertenece cada plantilla.
   */
  async listWhatsappTemplates(accountId: string): Promise<WhatsappTemplate[]> {
    const response = await this.request(
      `/v1/whatsapp/templates?accountId=${encodeURIComponent(accountId)}`,
      { method: 'GET' }
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw whatsappTemplatesErrorFrom(response.status, payload);
    return readWhatsappTemplates(payload);
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'La conexión automática de Zernio aún no está configurada.'
      );
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      return await fetch(`https://zernio.com/api${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          ...init.headers
        },
        signal: controller.signal
      });
    } catch {
      throw new ServiceUnavailableException('Zernio no está disponible en este momento.');
    } finally {
      clearTimeout(timeout);
    }
  }
}
