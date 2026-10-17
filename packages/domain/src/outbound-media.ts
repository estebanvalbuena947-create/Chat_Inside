import type { OutboundMediaExtension, OutboundMediaKind } from '@chat-zernio/contracts';

/**
 * El tipo de un adjunto saliente, por su extension.
 *
 * La extension no la elige nadie: la devuelve el reconocimiento por BYTES de la subida
 * (`recognizeMedia`), nunca el nombre ni el MIME que declaro el cliente. Esta tabla es la unica que
 * relaciona esa extension con la clase de adjunto que guarda la fila y con su tipo de contenido
 * canonico. La usan la subida -- para responder que se guardo -- y el envio -- para escribir la
 * fila --, asi que la relacion no puede separarse entre las dos.
 *
 * Cubre exactamente las extensiones que declara el contrato: si una se anade alli y falta aqui, el
 * tipo lo dice antes de ejecutar nada.
 */
const outboundMediaTypes: Record<
  OutboundMediaExtension,
  { contentType: string; kind: OutboundMediaKind }
> = {
  gif: { contentType: 'image/gif', kind: 'image' },
  jpg: { contentType: 'image/jpeg', kind: 'image' },
  mov: { contentType: 'video/quicktime', kind: 'video' },
  mp4: { contentType: 'video/mp4', kind: 'video' },
  pdf: { contentType: 'application/pdf', kind: 'file' },
  png: { contentType: 'image/png', kind: 'image' },
  webm: { contentType: 'video/webm', kind: 'video' },
  webp: { contentType: 'image/webp', kind: 'image' }
};

export type OutboundMediaType = {
  contentType: string;
  extension: OutboundMediaExtension;
  kind: OutboundMediaKind;
};

/** El tipo de una extension admitida, o nulo cuando ese archivo no se puede adjuntar. */
export function outboundMediaTypeForExtension(extension: unknown): OutboundMediaType | null {
  if (typeof extension !== 'string') return null;
  const tipo = outboundMediaTypes[extension as OutboundMediaExtension] as
    | { contentType: string; kind: OutboundMediaKind }
    | undefined;
  if (!tipo) return null;
  return {
    contentType: tipo.contentType,
    extension: extension as OutboundMediaExtension,
    kind: tipo.kind
  };
}

/**
 * Lo que cada canal admite adjuntar en un mensaje saliente.
 *
 * REQUIERE VERIFICACION OFICIAL contra el proveedor. Esta tabla es la declaracion de este
 * repositorio -- WhatsApp admite imagen, video y documento; los demas canales, imagen y video -- y
 * no una respuesta documentada de Zernio ni de Meta. Mientras no se verifique con un envio real en
 * cada canal, es un dato que puede estar equivocado: corregirlo es cambiar esta tabla y nada mas.
 *
 * Vive aqui, y no en la interfaz, porque ofrecer de mas termina en un rechazo del proveedor minutos
 * despues, cuando ya nadie relaciona el fallo con el archivo que se eligio.
 */
const outboundAttachmentKindsByPlatform: Record<string, readonly OutboundMediaKind[]> = {
  whatsapp: ['file', 'image', 'video']
};

/** Un canal sin capacidad declarada admite lo de la multimedia normal: imagen y video. */
const defaultOutboundAttachmentKinds: readonly OutboundMediaKind[] = ['image', 'video'];

/** Los tipos que ese canal admite. La plataforma se normaliza: la entrega el proveedor. */
export function outboundAttachmentKindsFor(platform: unknown): readonly OutboundMediaKind[] {
  const normalizada = typeof platform === 'string' ? platform.trim().toLowerCase() : '';
  return outboundAttachmentKindsByPlatform[normalizada] ?? defaultOutboundAttachmentKinds;
}

export function channelAcceptsOutboundAttachment(
  platform: unknown,
  kind: OutboundMediaKind
): boolean {
  return outboundAttachmentKindsFor(platform).includes(kind);
}
