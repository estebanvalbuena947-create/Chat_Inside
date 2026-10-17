/**
 * Estado de la vista de un archivo en grande (los comprobantes, entre otros).
 *
 * El aumento pertenece al archivo que se está mirando, no a la pantalla: al abrir otro archivo la
 * vista nace ajustada y al cerrar se descarta. Guardarlo como un estado aparte permitía abrir una
 * imagen ya ampliada —o enseñar «Ajustar imagen» sin nada ampliado—, que es justo lo que hacía dudar
 * de si el clic había servido.
 */
export type PreviewFile = {
  kind: string;
  title?: string | null;
  url: string | null;
};

export type MediaPreviewState<TFile extends PreviewFile> = {
  file: TFile | null;
  isZoomed: boolean;
};

/** Abre el archivo ajustado a la ventana: ampliarlo es siempre una acción posterior y explícita. */
export function openedPreview<TFile extends PreviewFile>(file: TFile): MediaPreviewState<TFile> {
  return { file, isZoomed: false };
}

export function closedPreview<TFile extends PreviewFile>(): MediaPreviewState<TFile> {
  return { file: null, isZoomed: false };
}

/** Conmuta el aumento. Sin archivo abierto no hay nada que ampliar y el estado no cambia. */
export function toggledPreviewZoom<TFile extends PreviewFile>(
  state: MediaPreviewState<TFile>
): MediaPreviewState<TFile> {
  return state.file === null ? state : { file: state.file, isZoomed: !state.isZoomed };
}

/**
 * Solo se amplía una imagen y solo si hay copia que mostrar. Un audio, un vídeo o un PDF no se
 * agrandan: se reproducen o se abren.
 */
export function canZoomPreview(file: PreviewFile | null): boolean {
  return file !== null && file.kind === 'image' && Boolean(file.url);
}

/** Nombre del archivo tal como lo lee el equipo; la etiqueta del proveedor no se muestra cruda. */
export function mediaKindLabel(kind: string): string {
  if (kind === 'image') return 'Imagen';
  if (kind === 'video') return 'Vídeo';
  if (kind === 'audio') return 'Audio';
  if (kind === 'share') return 'Publicación compartida';
  return 'Archivo';
}
