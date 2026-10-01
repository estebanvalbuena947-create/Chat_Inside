import { describe, expect, it } from 'vitest';
import {
  attachmentKindFromProvider,
  decodeMediaCursor,
  encodeMediaCursor,
  repairMojibake
} from './media';

describe('attachment classification', () => {
  it('maps the provider kind and falls back to a plain file', () => {
    expect(attachmentKindFromProvider('image')).toBe('image');
    expect(attachmentKindFromProvider('VIDEO')).toBe('video');
    expect(attachmentKindFromProvider('share')).toBe('share');
    expect(attachmentKindFromProvider('sticker')).toBe('file');
    expect(attachmentKindFromProvider(null)).toBe('file');
    expect(attachmentKindFromProvider(undefined)).toBe('file');
  });

  it('repairs the double encoding the provider sends in shared publication text', () => {
    // Escrito con secuencias escapadas: son los bytes exactos que entrega el proveedor, y
    // asi la prueba no depende de la codificacion del archivo.
    expect(repairMojibake('d\u00c3\u00adas de descanso')).toBe('d\u00edas de descanso');
    expect(repairMojibake('\u00e2\u0080\u009crespiro\u00e2\u0080\u009d')).toBe(
      '\u201crespiro\u201d'
    );
    expect(repairMojibake('ascii sin acentos')).toBe('ascii sin acentos');
    expect(repairMojibake('')).toBe('');
  });
});

describe('media cursor', () => {
  it('round-trips the position without exposing its shape', () => {
    const cursor = { createdAt: '2026-09-29T03:57:56.761Z', id: 'a1b2c3' };
    const encoded = encodeMediaCursor(cursor);

    expect(encoded).not.toContain('createdAt');
    expect(decodeMediaCursor(encoded)).toEqual(cursor);
  });

  it('rejects a cursor that was not issued by the application', () => {
    expect(decodeMediaCursor('no-es-base64-valido')).toBeNull();
    expect(
      decodeMediaCursor(Buffer.from('{"createdAt":"ayer","id":"x"}').toString('base64url'))
    ).toBeNull();
    expect(
      decodeMediaCursor(
        Buffer.from('{"createdAt":"2026-09-29T03:57:56.761Z"}').toString('base64url')
      )
    ).toBeNull();
    expect(decodeMediaCursor(Buffer.from('{"id":"x"}').toString('base64url'))).toBeNull();
    expect(decodeMediaCursor(Buffer.from('"texto"').toString('base64url'))).toBeNull();
  });
});
