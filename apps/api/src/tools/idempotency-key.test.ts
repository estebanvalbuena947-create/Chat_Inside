import { describe, expect, it } from 'vitest';
import { claveIdempotencia, uuidDesdeHash } from './idempotency-key';

/**
 * La clave de idempotencia de las tools.
 *
 * Lo que importa: que una clave legible se convierta en un UUID valido y que la conversion sea
 * determinista, porque de eso depende que un reintento de n8n repita el mensaje original en lugar de
 * mandar un segundo mensaje al cliente.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('clave de idempotencia de las tools', () => {
  it('convierte una clave legible en un UUID valido', () => {
    expect(String(claveIdempotencia('espacio-1', 'conv-1', 'flujo-4.2-paso-7-abc'))).toMatch(UUID);
  });

  it('es determinista para el mismo espacio, conversacion y clave', () => {
    const primera = claveIdempotencia('espacio-1', 'conv-1', 'catalogo-99');
    const reintento = claveIdempotencia('espacio-1', 'conv-1', 'catalogo-99');

    expect(reintento).toBe(primera);
  });

  it('separa espacios y conversaciones distintas con la misma clave legible', () => {
    const base = claveIdempotencia('espacio-1', 'conv-1', 'catalogo-99');

    expect(claveIdempotencia('espacio-1', 'conv-2', 'catalogo-99')).not.toBe(base);
    expect(claveIdempotencia('espacio-2', 'conv-1', 'catalogo-99')).not.toBe(base);
  });

  it('respeta un UUID ya valido', () => {
    const uuid = '6b1f4c2e-9d3a-4f58-8b7c-1e2d3f4a5b6c';

    expect(claveIdempotencia('espacio-1', 'conv-1', uuid)).toBe(uuid);
  });

  it('no convierte en clave valida un olvido: la deja como esta para que el esquema la rechace', () => {
    expect(claveIdempotencia('espacio-1', 'conv-1', '   ')).toBe('   ');
    expect(claveIdempotencia('espacio-1', 'conv-1', undefined)).toBeUndefined();
    expect(claveIdempotencia('espacio-1', 'conv-1', 42)).toBe(42);
  });

  it('da forma de UUID a cualquier hash sin salirse del hexadecimal', () => {
    const forma = uuidDesdeHash('f'.repeat(64));

    expect(forma).toMatch(UUID);
    expect(forma).toHaveLength(36);
  });
});
