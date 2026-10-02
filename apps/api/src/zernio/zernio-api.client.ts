import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException
} from '@nestjs/common';
import type { ZernioConnectPlatform } from '@chat-zernio/contracts';

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
