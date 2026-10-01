import { Injectable, ServiceUnavailableException } from '@nestjs/common';
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
        'Zernio no devolviÃ³ el perfil existente.'
      );
    }
    if (!response.ok) {
      throw new ServiceUnavailableException('No fue posible preparar la conexiÃ³n con Zernio.');
    }
    return requireString(payload._id, 'Zernio no devolviÃ³ el perfil creado.');
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
      throw new ServiceUnavailableException('No fue posible iniciar la conexiÃ³n con Zernio.');
    }
    const authorizationUrl = requireString(
      payload.authUrl,
      'Zernio no devolviÃ³ la autorizaciÃ³n de la plataforma.'
    );
    try {
      new URL(authorizationUrl);
      return authorizationUrl;
    } catch {
      throw new ServiceUnavailableException('Zernio devolviÃ³ una autorizaciÃ³n no vÃ¡lida.');
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
  private async request(path: string, init: RequestInit): Promise<Response> {
    const apiKey = process.env.ZERNIO_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'La conexiÃ³n automÃ¡tica de Zernio aÃºn no estÃ¡ configurada.'
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
      throw new ServiceUnavailableException('Zernio no estÃ¡ disponible en este momento.');
    } finally {
      clearTimeout(timeout);
    }
  }
}
