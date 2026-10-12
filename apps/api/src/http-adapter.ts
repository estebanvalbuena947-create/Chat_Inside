import { FastifyAdapter } from '@nestjs/platform-fastify';

/**
 * Limites del adaptador HTTP.
 *
 * Los nombres de recurso de Google se reciben completos desde el webhook y pueden superar el
 * maximo predeterminado de Fastify (100 caracteres). El limite se aplica a todos los parametros
 * de ruta, por eso se mantiene acotado aunque sea suficiente para esos identificadores.
 */
export const FASTIFY_OPTIONS = {
  bodyLimit: 262_144,
  routerOptions: {
    maxParamLength: 512
  }
} as const;

export function createHttpAdapter(): FastifyAdapter {
  return new FastifyAdapter(FASTIFY_OPTIONS);
}
