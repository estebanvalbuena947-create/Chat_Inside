import { UnauthorizedException } from '@nestjs/common';

export function extractBearerToken(authorization: unknown): string {
  if (typeof authorization !== 'string') {
    throw new UnauthorizedException('Se requiere una credencial Bearer.');
  }

  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match) {
    throw new UnauthorizedException('La credencial Bearer no es válida.');
  }

  return match[1];
}
