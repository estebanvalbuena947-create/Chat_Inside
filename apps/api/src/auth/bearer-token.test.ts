import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { extractBearerToken } from './bearer-token';

describe('extractBearerToken', () => {
  it('returns the token from a valid Bearer credential', () => {
    expect(extractBearerToken('Bearer signed.jwt')).toBe('signed.jwt');
  });

  it.each([
    undefined,
    '',
    'Basic signed.jwt',
    'Bearer ',
    'bearer signed.jwt',
    ['Bearer signed.jwt']
  ])('rejects an invalid or absent credential: %j', (authorization) => {
    expect(() => extractBearerToken(authorization)).toThrow(UnauthorizedException);
  });
});
