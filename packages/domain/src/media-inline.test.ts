import { describe, expect, it } from 'vitest';
import { attachmentKinds, rendersInline } from './media.js';

describe('que se presenta en linea dentro de la conversacion', () => {
  it('presenta la imagen, el audio y el video', () => {
    expect(rendersInline('image')).toBe(true);
    expect(rendersInline('audio')).toBe(true);
    expect(rendersInline('video')).toBe(true);
  });

  it('no presenta en linea lo que no tiene reproductor propio', () => {
    expect(rendersInline('file')).toBe(false);
    expect(rendersInline('share')).toBe(false);
  });

  it('obliga a decidir cuando aparece un tipo de adjunto nuevo', () => {
    const enLinea = attachmentKinds.filter((kind) => rendersInline(kind));
    expect(enLinea).toEqual(['audio', 'image', 'video']);
  });
});
