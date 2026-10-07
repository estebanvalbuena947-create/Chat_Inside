import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { SupabaseServerClientFactory } from '../infrastructure/supabase-server-client.factory';

const logger = new Logger('ToolToken');

/** Quien llama: el espacio del token y lo que ese token puede hacer. */
export type ToolIdentity = {
  scopes: string[];
  tenantId: string;
  tokenId: string;
};

/**
 * Resuelve el espacio a partir de la credencial de maquina que usan las tools.
 *
 * Nunca acepta una sesion de persona: una tool no actua en nombre de nadie. El token identifica
 * el espacio, por eso las rutas de tools no llevan `tenantId`.
 */
@Injectable()
export class ToolTokenService {
  constructor(
    @Inject(SupabaseServerClientFactory)
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  async authenticate(authorization: unknown): Promise<ToolIdentity> {
    const token = readBearerToken(authorization);
    if (!token) {
      throw new UnauthorizedException('Falta la credencial de la tool.');
    }

    const supabase = this.supabaseServerClientFactory.create();
    const { data, error } = await supabase
      .from('tool_tokens')
      .select('id, tenant_id, scopes, revoked_at')
      .eq('token_hash', hashToolToken(token))
      .maybeSingle();

    if (error) {
      throw new UnauthorizedException('No fue posible verificar la credencial de la tool.');
    }
    if (!data || data.revoked_at !== null) {
      throw new UnauthorizedException('La credencial de la tool no es válida.');
    }

    // El uso se anota sin bloquear la llamada: si falla, la tool ya hizo su trabajo, pero el fallo
    // se registra. Hay que encadenar `then`: en supabase-js la consulta no se envia hasta que se
    // espera su resultado, asi que un `void` encima la dejaba construida y sin enviar nunca.
    void supabase
      .from('tool_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id)
      .then(({ error: usageError }) => {
        if (usageError) {
          logger.warn(
            JSON.stringify({
              event: 'tool_token_usage_not_recorded',
              databaseCode: usageError.code ?? 'unknown'
            })
          );
        }
      });

    return {
      scopes: readScopes(data.scopes),
      tenantId: String(data.tenant_id),
      tokenId: String(data.id)
    };
  }

  /** Comprueba que el token tenga el alcance pedido antes de dejar pasar la llamada. */
  assertScope(identity: ToolIdentity, scope: string): void {
    if (!identity.scopes.includes(scope)) {
      throw new UnauthorizedException(`La credencial de la tool no tiene el alcance "${scope}".`);
    }
  }
}

/**
 * El token se guarda hasheado: quien lea la tabla no puede usarlo para llamar a la API.
 * Se usa SHA-256 porque el token lo genera el servidor con suficiente entropia, no una persona.
 */
export function hashToolToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function readBearerToken(authorization: unknown): string | null {
  if (typeof authorization !== 'string') return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  const value = match?.[1]?.trim();
  return value ? value : null;
}

function readScopes(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
