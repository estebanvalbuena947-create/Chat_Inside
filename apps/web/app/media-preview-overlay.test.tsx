import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  openedPreview,
  toggledPreviewZoom,
  type MediaPreviewState,
  type PreviewFile
} from '../lib/media-preview';
import MediaPreviewOverlay from './media-preview-overlay';

const stylesheet = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');

const comprobante: PreviewFile = {
  kind: 'image',
  title: null,
  url: 'https://almacen/comprobante-1.jpg'
};

function render(state: MediaPreviewState<PreviewFile>): string {
  return renderToStaticMarkup(
    <MediaPreviewOverlay
      caption="Ana"
      conversationId="conversacion-1"
      onClose={() => undefined}
      onOpenConversation={() => undefined}
      onToggleZoom={() => undefined}
      state={state}
    />
  );
}

describe('vista previa de un comprobante', () => {
  it('sin nada abierto no dibuja ninguna capa', () => {
    expect(render({ file: null, isZoomed: false })).toBe('');
  });

  it('la vista ajustada muestra la imagen y ofrece ampliarla', () => {
    const html = render(openedPreview(comprobante));
    expect(html).toContain('class="media-preview"');
    expect(html).not.toContain('is-zoomed');
    expect(html).toContain('src="https://almacen/comprobante-1.jpg"');
    expect(html).toContain('Ampliar imagen');
  });

  it('la vista ampliada lleva la clase que el CSS agranda, y el botón vuelve a ajustar', () => {
    const html = render(toggledPreviewZoom(openedPreview(comprobante)));
    expect(html).toContain('media-preview is-zoomed');
    expect(html).toContain('Ajustar imagen');
    // La clase no es decorativa: sin la regla, la imagen se quedaba encogida y el botón mentía.
    expect(stylesheet).toContain('.media-preview.is-zoomed img');
    expect(stylesheet).toContain('max-height: none');
  });

  it('un PDF no se amplía: se abre', () => {
    const pdf: PreviewFile = { kind: 'file', title: null, url: 'https://almacen/comprobante.pdf' };
    const html = render(openedPreview(pdf));
    expect(html).not.toContain('Ampliar imagen');
    expect(html).toContain('Abrir archivo');
  });

  it('dice de qué conversación salió el archivo', () => {
    const html = render(openedPreview(comprobante));
    expect(html).toContain('Ana');
    expect(html).toContain('Ir a la conversación');
  });
});
