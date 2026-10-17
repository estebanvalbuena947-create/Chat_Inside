/**
 * Lo que el compositor deja adjuntar y lo que dice de cada archivo.
 *
 * Aqui no se decide el tipo: lo reconoce la API por los **bytes**. Esto solo evita que la asesora
 * elija algo que va a ser rechazado y lo explica en claro cuando no se puede.
 */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export type OutboundAttachment = {
  byteSize: number;
  contentType: string;
  extension: string;
  kind: 'file' | 'image' | 'video';
  /** Nombre original, solo para que la persona reconozca lo que eligio. */
  name: string;
  uploadId: string;
};

const IMAGE_AND_VIDEO_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/webm'
];

/**
 * El documento es una capacidad de WhatsApp. En los demas canales no se ofrece: elegirlo acabaria en
 * un rechazo del proveedor minutos despues, no en un error de la interfaz.
 */
const DOCUMENT_TYPES = ['application/pdf'];

export function attachmentAccept(platform: string | null | undefined): string {
  const tipos =
    platform === 'whatsapp' ? [...IMAGE_AND_VIDEO_TYPES, ...DOCUMENT_TYPES] : IMAGE_AND_VIDEO_TYPES;
  return tipos.join(',');
}

/** Se comprueba antes de subir: 25 MB es el limite del lector de la API y del deposito. */
export function attachmentSizeError(byteSize: number): string | null {
  if (byteSize <= 0) return 'El archivo está vacío.';
  if (byteSize > MAX_ATTACHMENT_BYTES) return 'El archivo supera el límite de 25 MB.';
  return null;
}

/** Un tamano legible: «12,4 MB» dice mas que «13002342». */
export function attachmentSizeLabel(byteSize: number): string {
  if (byteSize >= 1024 * 1024) return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
  if (byteSize >= 1024) return `${Math.round(byteSize / 1024)} KB`;
  return `${byteSize} B`;
}

/** Con archivo, el pie es opcional; sin archivo hace falta texto. */
export function canSendConversationMessage(body: string, hasAttachment: boolean): boolean {
  return body.trim().length > 0 || hasAttachment;
}
