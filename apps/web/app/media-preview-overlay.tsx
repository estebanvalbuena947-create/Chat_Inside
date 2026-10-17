'use client';

import {
  canZoomPreview,
  mediaKindLabel,
  type MediaPreviewState,
  type PreviewFile
} from '../lib/media-preview';

type MediaPreviewOverlayProps = {
  /** Quién envió el archivo: sin eso el equipo no sabe de qué conversación salió lo que está viendo. */
  caption: string | null;
  conversationId?: string | null;
  onClose: () => void;
  onOpenConversation?: (conversationId: string) => void;
  onToggleZoom: () => void;
  state: MediaPreviewState<PreviewFile>;
};

/**
 * Vista de un archivo en grande, por encima de todo lo demás.
 *
 * Es una sola pieza para toda la aplicación. La vista previa que vivía dentro de la sección de
 * comprobantes no aparecía al pulsar una imagen en la conversación: el clic no cambiaba nada visible.
 * Y como la imagen se quedaba siempre encogida a la ventana, tampoco había forma de ampliarla.
 *
 * Aquí el clic sobre la imagen —o el botón— la lleva a su tamaño completo con desplazamiento, y el
 * mismo clic la vuelve a ajustar. Un audio, un vídeo o un PDF no tienen nada que ampliar: se ofrecen
 * para abrir.
 */
export default function MediaPreviewOverlay({
  caption,
  conversationId,
  onClose,
  onOpenConversation,
  onToggleZoom,
  state
}: MediaPreviewOverlayProps): React.ReactNode {
  const file = state.file;
  if (!file) return null;

  const zoomable = canZoomPreview(file);

  return (
    <div
      aria-label={`Vista previa de ${mediaKindLabel(file.kind)}`}
      aria-modal="true"
      className={state.isZoomed ? 'media-preview is-zoomed' : 'media-preview'}
      onClick={onClose}
      role="dialog"
    >
      {/* El clic dentro de la tarjeta no cierra la vista: solo la imagen decide si amplía o ajusta. */}
      <figure onClick={(event) => event.stopPropagation()}>
        {file.url && file.kind === 'image' ? (
          <img
            alt={file.title ?? 'Imagen ampliada'}
            onClick={zoomable ? onToggleZoom : undefined}
            src={file.url}
            title={
              zoomable
                ? state.isZoomed
                  ? 'Ajustar la imagen a la ventana'
                  : 'Ver la imagen a tamaño completo'
                : undefined
            }
          />
        ) : file.url && file.kind === 'audio' ? (
          <audio controls src={file.url} />
        ) : file.url && file.kind === 'video' ? (
          <video controls src={file.url} />
        ) : (
          <p>
            {file.url
              ? `${mediaKindLabel(file.kind)} recibido. Ábrelo para verlo.`
              : 'La copia de este archivo no está disponible.'}
          </p>
        )}
        {file.title && <p className="media-preview-caption">{file.title}</p>}
        <figcaption>
          {caption && <strong>{caption}</strong>}
          {zoomable && (
            <button onClick={onToggleZoom} type="button">
              {state.isZoomed ? 'Ajustar imagen' : 'Ampliar imagen'}
            </button>
          )}
          {file.url && file.kind !== 'image' && (
            <a href={file.url} rel="noreferrer" target="_blank">
              Abrir archivo
            </a>
          )}
          {conversationId && onOpenConversation && (
            <button onClick={() => onOpenConversation(conversationId)} type="button">
              Ir a la conversación
            </button>
          )}
          <button onClick={onClose} type="button">
            Cerrar
          </button>
        </figcaption>
      </figure>
    </div>
  );
}
