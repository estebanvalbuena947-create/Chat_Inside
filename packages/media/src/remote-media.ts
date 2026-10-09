import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Descarga de un archivo remoto publicado por el proveedor.
 *
 * La multimedia llega como un enlace externo, asi que se trata como entrada no confiable:
 * solo https, sin credenciales en la URL y solo si el host resuelve a direcciones publicas
 * (evita que un enlace apunte a la red interna). El tipo se reconoce despues por los bytes,
 * nunca por lo que declare el proveedor.
 *
 * Vive en un paquete propio porque lo usan dos aplicaciones: el trabajador, al copiar lo que
 * envia un contacto, y la API, al importar la multimedia de una sede desde un enlace. Antes
 * estaba en el trabajador y la API no podia alcanzarlo.
 */
export type RemoteFile = {
  bytes: Buffer;
  contentType: string;
  extension: string;
};

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [first, second] = address.split('.').map(Number);
    return !(
      first === 0 ||
      first === 10 ||
      first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 198 && (second === 18 || second === 19)) ||
      first >= 224
    );
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    return !(
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    );
  }
  return false;
}

async function hasOnlyPublicAddresses(hostname: string): Promise<boolean> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  return addresses.length > 0 && addresses.every((entry) => isPublicAddress(entry.address));
}

/** Reconoce el tipo real del archivo por sus primeros bytes. */
export function recognizeMedia(buffer: Buffer): { contentType: string; extension: string } | null {
  const startsWith = (bytes: number[], offset = 0) =>
    buffer.length >= offset + bytes.length &&
    buffer.subarray(offset, offset + bytes.length).equals(Buffer.from(bytes));

  if (startsWith([0xff, 0xd8, 0xff])) return { contentType: 'image/jpeg', extension: 'jpg' };
  // Un comprobante de pago llega muchas veces en PDF. Sin esta firma, el archivo se descarga y se
  // descarta, y la validacion del pago se queda sin su prueba.
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { contentType: 'application/pdf', extension: 'pdf' };
  }
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { contentType: 'image/png', extension: 'png' };
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF') {
    const format = buffer.subarray(8, 12).toString('ascii');
    if (format === 'WEBP') return { contentType: 'image/webp', extension: 'webp' };
    if (format === 'AVI ') return { contentType: 'video/x-msvideo', extension: 'avi' };
  }
  if (buffer.length >= 6) {
    const header = buffer.subarray(0, 6).toString('ascii');
    if (header === 'GIF87a' || header === 'GIF89a') {
      return { contentType: 'image/gif', extension: 'gif' };
    }
  }
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii');
    if (brand.startsWith('qt')) return { contentType: 'video/quicktime', extension: 'mov' };
    return { contentType: 'video/mp4', extension: 'mp4' };
  }
  if (startsWith([0x1a, 0x45, 0xdf, 0xa3])) return { contentType: 'video/webm', extension: 'webm' };
  if (startsWith([0x4f, 0x67, 0x67, 0x53])) return { contentType: 'audio/ogg', extension: 'ogg' };
  if (startsWith([0x49, 0x44, 0x33]) || startsWith([0xff, 0xfb]) || startsWith([0xff, 0xf3])) {
    return { contentType: 'audio/mpeg', extension: 'mp3' };
  }
  return null;
}

export async function fetchRemoteMedia(input: {
  maxBytes: number;
  sourceUrl: string;
  timeoutMs: number;
}): Promise<RemoteFile | null> {
  let url: URL;
  try {
    url = new URL(input.sourceUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;

  try {
    if (!(await hasOnlyPublicAddresses(url.hostname))) return null;
    const response = await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(input.timeoutMs)
    });
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (!response.ok) return null;
    if (Number.isFinite(declaredLength) && declaredLength > input.maxBytes) return null;

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > input.maxBytes) return null;

    const media = recognizeMedia(bytes);
    if (!media) return null;
    return { bytes, contentType: media.contentType, extension: media.extension };
  } catch {
    return null;
  }
}
