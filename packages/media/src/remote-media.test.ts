import { describe, expect, it } from 'vitest';
import { recognizeMedia } from './remote-media';

/**
 * Reconocimiento del tipo por los bytes reales.
 *
 * Esta funcion decide que se escribe en el almacen y con que tipo se sirve despues. Nunca se cree
 * lo que declara el proveedor -- ni el nombre del archivo, ni la cabecera content-type -- porque
 * ambos pueden mentir.
 *
 * Se prueba caso por caso porque los formatos se distinguen por firmas distintas, y algunas son
 * tramposas: RIFF sirve para WebP y para AVI, y hay que mirar mas alla de los cuatro primeros
 * bytes. Una foto real de JPEG no habria detectado ninguno de esos matices.
 */

/** Devuelve un Buffer con los bytes indicados y relleno hasta el tamano pedido. */
function bytes(iniciales: number[], total = 0): Buffer {
  const datos = Buffer.from(iniciales);
  if (total <= datos.length) return datos;
  return Buffer.concat([datos, Buffer.alloc(total - datos.length)]);
}

/** Un MP4/MOV: en el desplazamiento 4 va 'ftyp' y despues la marca. */
function contenedor(marca: string): Buffer {
  return Buffer.concat([
    bytes([0x00, 0x00, 0x00, 0x18]),
    Buffer.from('ftyp', 'ascii'),
    Buffer.from(marca, 'ascii'),
    Buffer.alloc(4)
  ]);
}

describe('reconocimiento de imagenes', () => {
  it('reconoce un JPEG por su firma', () => {
    expect(recognizeMedia(bytes([0xff, 0xd8, 0xff, 0xe0]))).toEqual({
      contentType: 'image/jpeg',
      extension: 'jpg'
    });
  });

  it('reconoce un PNG por sus ocho bytes de cabecera', () => {
    expect(recognizeMedia(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toEqual({
      contentType: 'image/png',
      extension: 'png'
    });
  });

  it('distingue WebP de AVI: los dos empiezan por RIFF y hay que mirar mas alla', () => {
    const webp = Buffer.concat([Buffer.from('RIFF'), bytes([0, 0, 0, 0]), Buffer.from('WEBP')]);
    const avi = Buffer.concat([Buffer.from('RIFF'), bytes([0, 0, 0, 0]), Buffer.from('AVI ')]);

    expect(recognizeMedia(webp)).toEqual({ contentType: 'image/webp', extension: 'webp' });
    expect(recognizeMedia(avi)).toEqual({ contentType: 'video/x-msvideo', extension: 'avi' });
  });

  it('acepta las dos versiones de GIF', () => {
    for (const version of ['GIF87a', 'GIF89a']) {
      expect(recognizeMedia(Buffer.from(version, 'ascii'))).toEqual({
        contentType: 'image/gif',
        extension: 'gif'
      });
    }
  });
});

describe('reconocimiento de video y audio', () => {
  it('reconoce un MP4 y un MOV: la marca dentro de ftyp decide', () => {
    expect(recognizeMedia(contenedor('isom'))).toEqual({
      contentType: 'video/mp4',
      extension: 'mp4'
    });
    expect(recognizeMedia(contenedor('qt  '))).toEqual({
      contentType: 'video/quicktime',
      extension: 'mov'
    });
  });

  it('reconoce WebM, OGG y las tres firmas de MP3', () => {
    expect(recognizeMedia(bytes([0x1a, 0x45, 0xdf, 0xa3]))?.extension).toBe('webm');
    expect(recognizeMedia(Buffer.from('OggS', 'ascii'))?.extension).toBe('ogg');
    expect(recognizeMedia(bytes([0x49, 0x44, 0x33]))?.extension).toBe('mp3');
    expect(recognizeMedia(bytes([0xff, 0xfb]))?.extension).toBe('mp3');
    expect(recognizeMedia(bytes([0xff, 0xf3]))?.extension).toBe('mp3');
  });
});

describe('lo que no se puede reconocer', () => {
  it('devuelve nulo con un archivo desconocido, y no lo escribe en el almacen', () => {
    expect(recognizeMedia(Buffer.from('esto no es una imagen', 'ascii'))).toBeNull();
  });

  it('devuelve nulo con un archivo vacio', () => {
    expect(recognizeMedia(Buffer.alloc(0))).toBeNull();
  });

  it('no se deja enganar por una cabecera cortada', () => {
    // Los dos primeros bytes de un JPEG no bastan: hacen falta tres.
    expect(recognizeMedia(bytes([0xff, 0xd8]))).toBeNull();
    // RIFF sin los cuatro bytes de la marca tampoco.
    expect(recognizeMedia(Buffer.from('RIFF', 'ascii'))).toBeNull();
  });

  it('manda el contenido sobre el nombre: un .png que es en realidad un JPEG', () => {
    // La funcion solo recibe bytes; el nombre jamas entra en la decision. Esa es la regla.
    expect(recognizeMedia(bytes([0xff, 0xd8, 0xff]))?.contentType).toBe('image/jpeg');
  });
});
