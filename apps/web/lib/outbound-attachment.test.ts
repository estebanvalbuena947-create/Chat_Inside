import { describe, expect, it } from 'vitest';
import {
  MAX_ATTACHMENT_BYTES,
  attachmentAccept,
  attachmentSizeError,
  attachmentSizeLabel,
  canSendConversationMessage
} from './outbound-attachment';

describe('qué archivo se puede elegir', () => {
  it('en WhatsApp se ofrece también el documento', () => {
    expect(attachmentAccept('whatsapp')).toContain('application/pdf');
    expect(attachmentAccept('whatsapp')).toContain('image/jpeg');
  });

  it('en los demás canales no se ofrece el documento', () => {
    expect(attachmentAccept('instagram')).not.toContain('application/pdf');
    expect(attachmentAccept('instagram')).toContain('video/mp4');
  });

  it('un canal desconocido se queda con lo que admiten todos', () => {
    expect(attachmentAccept(null)).not.toContain('application/pdf');
    expect(attachmentAccept(undefined)).toContain('image/png');
  });
});

describe('límite de tamaño', () => {
  it('acepta justo el límite y rechaza un byte más', () => {
    expect(attachmentSizeError(MAX_ATTACHMENT_BYTES)).toBeNull();
    expect(attachmentSizeError(MAX_ATTACHMENT_BYTES + 1)).toContain('25 MB');
  });

  it('un archivo vacío se dice como tal, no como «demasiado grande»', () => {
    expect(attachmentSizeError(0)).toContain('vacío');
  });
});

describe('cómo se describe el archivo', () => {
  it('traduce los bytes a una medida legible', () => {
    expect(attachmentSizeLabel(512)).toBe('512 B');
    expect(attachmentSizeLabel(2048)).toBe('2 KB');
    expect(attachmentSizeLabel(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});

describe('cuándo se puede enviar', () => {
  it('con texto, con archivo o con los dos', () => {
    expect(canSendConversationMessage('hola', false)).toBe(true);
    expect(canSendConversationMessage('', true)).toBe(true);
    expect(canSendConversationMessage('mira esto', true)).toBe(true);
  });

  it('sin texto y sin archivo no hay nada que enviar', () => {
    expect(canSendConversationMessage('', false)).toBe(false);
    expect(canSendConversationMessage('   ', false)).toBe(false);
  });
});
