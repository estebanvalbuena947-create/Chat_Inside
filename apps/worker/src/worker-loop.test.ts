import { describe, expect, it, vi } from 'vitest';
import { startWorkerLoop } from './worker-loop';

describe('worker loop', () => {
  it('starts immediately and schedules a referenced recurring drain', async () => {
    const drain = vi.fn(async () => undefined);
    const unref = vi.fn();
    const timer = { unref };
    const schedule = vi.fn(() => timer);

    const result = startWorkerLoop(drain, schedule);

    await Promise.resolve();
    expect(drain).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 5_000);
    expect(result).toBe(timer);
    expect(unref).not.toHaveBeenCalled();
  });

  /**
   * Dos ciclos solapados entregaban el mismo aviso dos veces: la fila seguia pendiente mientras el
   * aviso viajaba a n8n y el ciclo siguiente la volvia a tomar. El reloj puede insistir, pero un
   * ciclo no empieza hasta que el anterior termina.
   */
  it('no solapa dos ciclos: el tic que llega mientras uno corre se salta', async () => {
    let resolver: (() => void) | undefined;
    const drain = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolver = resolve;
        })
    );
    let tic: (() => void) | undefined;
    const schedule = vi.fn((callback: () => void) => {
      tic = callback;
      return {};
    });

    startWorkerLoop(drain, schedule);
    await Promise.resolve();
    expect(drain).toHaveBeenCalledTimes(1);

    // El reloj insiste dos veces mientras el primer ciclo sigue en marcha.
    tic?.();
    tic?.();
    expect(drain).toHaveBeenCalledTimes(1);

    // Al terminar, el siguiente tic si arranca un ciclo nuevo.
    resolver?.();
    await Promise.resolve();
    await Promise.resolve();
    tic?.();
    expect(drain).toHaveBeenCalledTimes(2);
  });

  it('un ciclo que falla no detiene el bucle', async () => {
    const drain = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('fallo del ciclo'))
      .mockResolvedValue(undefined);
    let tic: (() => void) | undefined;
    const schedule = vi.fn((callback: () => void) => {
      tic = callback;
      return {};
    });

    startWorkerLoop(drain, schedule);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    tic?.();
    await Promise.resolve();

    expect(drain).toHaveBeenCalledTimes(2);
  });
});
