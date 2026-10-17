import { describe, expect, it } from 'vitest';
import {
  channelAcceptsOutboundAttachment,
  outboundAttachmentKindsFor,
  outboundMediaTypeForExtension
} from './outbound-media';

/**
 * Lo que se puede adjuntar y quien lo admite.
 *
 * No se comprueba la tabla, se comprueba la decision: que una extension admitida tenga su tipo de
 * contenido, que una que no lo esta no tenga ninguno, y que la capacidad del canal se consulte por
 * plataforma -- normalizada -- en vez de por el nombre que traiga la peticion.
 */
describe('tipo de un adjunto saliente por su extension', () => {
  it('resuelve el tipo de contenido y la clase de cada extension admitida', () => {
    expect(outboundMediaTypeForExtension('jpg')).toEqual({
      contentType: 'image/jpeg',
      extension: 'jpg',
      kind: 'image'
    });
    expect(outboundMediaTypeForExtension('webp')?.kind).toBe('image');
    expect(outboundMediaTypeForExtension('mov')?.contentType).toBe('video/quicktime');
    expect(outboundMediaTypeForExtension('webm')?.kind).toBe('video');
    expect(outboundMediaTypeForExtension('pdf')).toEqual({
      contentType: 'application/pdf',
      extension: 'pdf',
      kind: 'file'
    });
  });

  it('no admite una extension que no este declarada, venga como venga', () => {
    // `avi`, `mp3` y `ogg` existen en otros caminos del repositorio, pero no como adjunto saliente.
    for (const noAdmitida of ['avi', 'mp3', 'ogg', 'JPG', 'jpg ', '', 'jpg.exe']) {
      expect(outboundMediaTypeForExtension(noAdmitida)).toBeNull();
    }
    for (const noTexto of [null, undefined, 7, {}, ['jpg']]) {
      expect(outboundMediaTypeForExtension(noTexto)).toBeNull();
    }
  });
});

describe('capacidad de adjuntos por canal', () => {
  it('WhatsApp admite imagen, video y documento', () => {
    expect(outboundAttachmentKindsFor('whatsapp')).toEqual(['file', 'image', 'video']);
    expect(channelAcceptsOutboundAttachment('whatsapp', 'file')).toBe(true);
    expect(channelAcceptsOutboundAttachment('whatsapp', 'video')).toBe(true);
  });

  it('los canales sin documento declarado solo admiten imagen y video', () => {
    for (const plataforma of ['instagram', 'facebook', 'tiktok', 'messenger', 'desconocido']) {
      expect(channelAcceptsOutboundAttachment(plataforma, 'file')).toBe(false);
      expect(channelAcceptsOutboundAttachment(plataforma, 'image')).toBe(true);
      expect(channelAcceptsOutboundAttachment(plataforma, 'video')).toBe(true);
    }
  });

  it('la plataforma se normaliza y su ausencia no inventa un documento', () => {
    expect(channelAcceptsOutboundAttachment('  WhatsApp ', 'file')).toBe(true);
    expect(channelAcceptsOutboundAttachment('WHATSAPP', 'file')).toBe(true);
    for (const sinPlataforma of [null, undefined, '', 7, {}]) {
      expect(outboundAttachmentKindsFor(sinPlataforma)).toEqual(['image', 'video']);
      expect(channelAcceptsOutboundAttachment(sinPlataforma, 'file')).toBe(false);
    }
  });
});
