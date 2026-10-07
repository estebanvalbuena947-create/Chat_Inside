import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ToolTokenService, hashToolToken } from './tool-token.service';

const tenantId = '11111111-1111-4111-8111-111111111111';
const tokenId = '22222222-2222-4222-8222-222222222222';
const token = 'wep_tool_abc123';

function createService(row: unknown, error: unknown = null) {
  const updates: unknown[] = [];
  const sent: string[] = [];
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error }),
    select: vi.fn(() => query),
    update: vi.fn((value: unknown) => {
      updates.push(value);
      return query;
    }),
    // En supabase-js una consulta no se envia hasta que se espera su resultado. El doble lo
    // representa, para que un `update` construido y nunca encadenado se note en la prueba.
    then: vi.fn((resolve: (value: { error: null }) => unknown) => {
      sent.push('tool_tokens');
      return Promise.resolve({ error: null }).then(resolve);
    })
  };
  const service = new ToolTokenService({
    create: () => ({ from: () => query })
  } as never);
  return { service, sent, updates };
}

describe('ToolTokenService', () => {
  it('hashea el token de forma estable y sin guardarlo en claro', () => {
    const hash = hashToolToken(token);
    expect(hash).toBe(hashToolToken(token));
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('resuelve el espacio con una credencial válida y anota su uso', async () => {
    const { service, sent, updates } = createService({
      id: tokenId,
      revoked_at: null,
      scopes: ['messages', 'media'],
      tenant_id: tenantId
    });

    await expect(service.authenticate(`Bearer ${token}`)).resolves.toEqual({
      scopes: ['messages', 'media'],
      tenantId,
      tokenId
    });
    expect(updates).toHaveLength(1);
    expect(updates[0]).toHaveProperty('last_used_at');
    // Construir la anotacion no basta: tiene que enviarse. Antes se quedaba sin enviar, y una
    // credencial en uso parecia no haberse usado nunca.
    expect(sent).toContain('tool_tokens');
  });

  it('rechaza una credencial revocada aunque exista', async () => {
    const { service } = createService({
      id: tokenId,
      revoked_at: '2026-09-30T00:00:00.000Z',
      scopes: ['messages'],
      tenant_id: tenantId
    });

    await expect(service.authenticate(`Bearer ${token}`)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza una credencial desconocida y una petición sin cabecera', async () => {
    const { service: desconocida } = createService(null);
    await expect(desconocida.authenticate(`Bearer ${token}`)).rejects.toThrow(
      UnauthorizedException
    );

    const { service: sinCabecera } = createService(null);
    await expect(sinCabecera.authenticate(undefined)).rejects.toThrow(UnauthorizedException);
    await expect(sinCabecera.authenticate('Basic algo')).rejects.toThrow(UnauthorizedException);
  });

  it('exige el alcance antes de dejar pasar una llamada', async () => {
    const { service } = createService({
      id: tokenId,
      revoked_at: null,
      scopes: ['media'],
      tenant_id: tenantId
    });
    const identity = await service.authenticate(`Bearer ${token}`);

    expect(() => service.assertScope(identity, 'media')).not.toThrow();
    expect(() => service.assertScope(identity, 'messages')).toThrow(UnauthorizedException);
  });
});
