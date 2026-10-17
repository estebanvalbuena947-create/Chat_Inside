import { describe, expect, it } from 'vitest';
import {
  canZoomPreview,
  closedPreview,
  mediaKindLabel,
  openedPreview,
  toggledPreviewZoom,
  type PreviewFile
} from './media-preview';

const comprobante: PreviewFile = {
  kind: 'image',
  title: null,
  url: 'https://almacen/comprobante-1.jpg'
};

describe('aumento de la vista previa', () => {
  it('abre el archivo ajustado a la ventana', () => {
    expect(openedPreview(comprobante)).toEqual({ file: comprobante, isZoomed: false });
  });

  it('amplía y vuelve a ajustar con el mismo clic', () => {
    const ampliada = toggledPreviewZoom(openedPreview(comprobante));
    expect(ampliada.isZoomed).toBe(true);
    expect(toggledPreviewZoom(ampliada).isZoomed).toBe(false);
  });

  it('no hereda el aumento al abrir otro archivo', () => {
    const ampliada = toggledPreviewZoom(openedPreview(comprobante));
    expect(ampliada.isZoomed).toBe(true);

    const siguiente = openedPreview({
      ...comprobante,
      url: 'https://almacen/comprobante-2.jpg'
    });

    expect(siguiente.isZoomed).toBe(false);
    expect(siguiente.file?.url).toBe('https://almacen/comprobante-2.jpg');
  });

  it('cierra sin archivo y sin aumento a medias', () => {
    expect(closedPreview<PreviewFile>()).toEqual({ file: null, isZoomed: false });
  });

  it('sin archivo abierto el clic no cambia el estado', () => {
    const cerrado = closedPreview<PreviewFile>();
    expect(toggledPreviewZoom(cerrado)).toBe(cerrado);
  });
});

describe('qué se puede ampliar', () => {
  it('una imagen con copia sí', () => {
    expect(canZoomPreview(comprobante)).toBe(true);
    expect(canZoomPreview({ kind: 'image', url: 'https://almacen/foto.png' })).toBe(true);
  });

  it('una imagen sin copia no: no hay nada que agrandar', () => {
    expect(canZoomPreview({ kind: 'image', url: null })).toBe(false);
  });

  it('un audio, un vídeo o un PDF no: se abren', () => {
    expect(canZoomPreview({ kind: 'audio', url: 'https://almacen/nota.ogg' })).toBe(false);
    expect(canZoomPreview({ kind: 'video', url: 'https://almacen/clip.mp4' })).toBe(false);
    expect(canZoomPreview({ kind: 'file', url: 'https://almacen/comprobante.pdf' })).toBe(false);
  });

  it('sin archivo no hay nada que ampliar', () => {
    expect(canZoomPreview(null)).toBe(false);
  });
});

describe('nombre del archivo', () => {
  it('traduce las etiquetas del proveedor', () => {
    expect(mediaKindLabel('image')).toBe('Imagen');
    expect(mediaKindLabel('video')).toBe('Vídeo');
    expect(mediaKindLabel('audio')).toBe('Audio');
    expect(mediaKindLabel('share')).toBe('Publicación compartida');
  });

  it('lo desconocido se llama Archivo en vez de salir crudo', () => {
    expect(mediaKindLabel('sticker')).toBe('Archivo');
  });
});
