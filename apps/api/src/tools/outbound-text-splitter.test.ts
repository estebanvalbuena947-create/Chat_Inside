import { describe, expect, it } from 'vitest';
import {
  OUTBOUND_TEXT_LIMIT,
  partIdempotencyKey,
  splitOutboundText
} from './outbound-text-splitter';

describe('splitOutboundText', () => {
  it('deja intacto un texto que cabe', () => {
    expect(splitOutboundText('Hola, tu cita quedo confirmada.')).toEqual([
      'Hola, tu cita quedo confirmada.'
    ]);
  });

  it('no parte un texto que mide justo el limite', () => {
    const texto = 'a'.repeat(OUTBOUND_TEXT_LIMIT);
    expect(splitOutboundText(texto)).toEqual([texto]);
  });

  it('corta por el salto de parrafo, que es donde separa sus partes quien escribe', () => {
    const primera = 'Parte uno ' + 'x'.repeat(500);
    const segunda = 'Parte dos ' + 'y'.repeat(500);
    expect(splitOutboundText(`${primera}\n\n${segunda}`)).toEqual([primera, segunda]);
  });

  it('si no hay parrafo, corta por el ultimo salto de linea', () => {
    const primera = 'a'.repeat(600);
    const segunda = 'b'.repeat(400);
    expect(splitOutboundText(`${primera}\n${segunda}`)).toEqual([primera, segunda]);
  });

  it('si no hay saltos, corta por el ultimo espacio', () => {
    const primera = 'a'.repeat(600);
    const segunda = 'b'.repeat(400);
    expect(splitOutboundText(`${primera} ${segunda}`)).toEqual([primera, segunda]);
  });

  it('cuando no hay donde cortar con sentido, corta por el limite', () => {
    const partes = splitOutboundText('a'.repeat(1000));
    expect(partes).toEqual(['a'.repeat(OUTBOUND_TEXT_LIMIT), 'a'.repeat(100)]);
  });

  it('nunca devuelve una parte vacia: prefiere mandar el texto entero', () => {
    const texto = ' '.repeat(1000);
    expect(splitOutboundText(texto)).toEqual([texto]);
  });

  it('la primera parte respeta el limite', () => {
    const partes = splitOutboundText('palabra '.repeat(300));
    expect(partes.length).toBe(2);
    expect(partes[0].length).toBeLessThanOrEqual(OUTBOUND_TEXT_LIMIT);
  });
});

describe('partIdempotencyKey', () => {
  const original = '6b1f4c2e-9d3a-4f58-8b7c-1e2d3f4a5b6c';

  it('deja la clave de la primera parte como estaba', () => {
    expect(partIdempotencyKey(original, 1)).toBe(original);
  });

  it('da a la segunda parte un UUID distinto: el contrato no admite otra cosa', () => {
    const clave = partIdempotencyKey(original, 2);
    expect(clave).not.toBe(original);
    expect(clave).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('es determinista: un reintento produce la misma clave', () => {
    expect(partIdempotencyKey(original, 2)).toBe(partIdempotencyKey(original, 2));
  });
});
