/**
 * Clasificacion de la multimedia que envia el proveedor.
 *
 * El tipo lo declara el proveedor y solo se usa para decidir como presentar el adjunto; la
 * decision de guardarlo o no depende del contenido real del archivo, que se reconoce por sus
 * bytes al descargarlo.
 */
export const attachmentKinds = ['audio', 'file', 'image', 'share', 'video'] as const;

export type AttachmentKind = (typeof attachmentKinds)[number];

const providerKindMap: Record<string, AttachmentKind> = {
  audio: 'audio',
  file: 'file',
  image: 'image',
  share: 'share',
  video: 'video'
};

export function attachmentKindFromProvider(value: unknown): AttachmentKind {
  if (typeof value !== 'string') return 'file';
  return providerKindMap[value.trim().toLowerCase()] ?? 'file';
}

/**
 * Tipos que se presentan en linea dentro de la conversacion: imagen, audio y video. El audio y el
 * video traen sus propios controles, asi que se consumen sin salir del chat; el resto se abre aparte.
 */
export function rendersInline(kind: AttachmentKind): boolean {
  return kind === 'image' || kind === 'audio' || kind === 'video';
}

/**
 * Repara el texto que el proveedor entrega con doble codificacion (bytes UTF-8 leidos como
 * latin-1), un defecto real de sus datos que dejaria la publicacion ilegible.
 *
 * Solo actua cuando aparecen las secuencias tipicas del defecto y la reparacion produce un
 * texto valido: ante la duda, se conserva el original.
 */
export function repairMojibake(value: string): string {
  // Se escribe con secuencias escapadas a proposito: los caracteres del defecto son
  // invisibles o se confunden con los de cp1252.
  if (!/[\u00c3\u00c2][\u0080-\u00bf]|\u00e2[\u0080-\u00bf]/.test(value)) return value;
  try {
    const repaired = Buffer.from(value, 'latin1').toString('utf8');
    return repaired.includes('\uFFFD') ? value : repaired;
  } catch {
    return value;
  }
}

/**
 * Cursor opaco para recorrer la galeria por fecha descendente.
 *
 * Va codificado y validado al decodificar: la API nunca acepta un cursor construido a mano,
 * y devuelve una peticion invalida si no puede interpretarlo.
 */
export type MediaCursor = {
  createdAt: string;
  id: string;
};

export function encodeMediaCursor(cursor: MediaCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeMediaCursor(value: string): MediaCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    const candidate = parsed as Record<string, unknown>;
    const createdAt = candidate.createdAt;
    const id = candidate.id;
    if (typeof createdAt !== 'string' || typeof id !== 'string') return null;
    if (Number.isNaN(new Date(createdAt).getTime())) return null;
    if (id.length === 0 || id.length > 64) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
