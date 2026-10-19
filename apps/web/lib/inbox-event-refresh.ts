/** Agrupa invalidaciones y espera las lecturas en curso antes de recargar. */
export function createInboxEventRefresh(options: {
  refresh: () => void;
  pendingReads: () => Promise<unknown>[];
  isVisible: () => boolean;
}) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let waiting = false;
  let active = true;
  let dirty = false;

  const request = () => {
    dirty = true;
    if (!active || !options.isVisible() || timer || waiting) return;
    timer = setTimeout(() => {
      timer = null;
      waiting = true;
      void Promise.allSettled(options.pendingReads()).then(() => {
        waiting = false;
        if (!active || !options.isVisible()) return;
        dirty = false;
        options.refresh();
      });
    }, 200);
  };
  return {
    request,
    resume() {
      // También cubre cambios durante una suspensión del navegador sin eventos.
      if (dirty || options.isVisible()) request();
    },
    dispose() {
      active = false;
      if (timer) clearTimeout(timer);
    }
  };
}
