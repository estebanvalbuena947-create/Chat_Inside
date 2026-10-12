export type WorkerDrain = () => Promise<void>;
export type IntervalScheduler = (callback: () => void, intervalMs: number) => unknown;

/**
 * Arranca el ciclo del trabajador.
 *
 * El reloj insiste cada cinco segundos, pero **un ciclo no empieza hasta que el anterior termina**.
 * Sin esa guarda, dos ciclos se solapaban en cuanto uno tardaba mas que el intervalo -- y un aviso al
 * bot tarda segundos, porque lee los adjuntos, firma enlaces y espera a n8n--, de modo que el segundo
 * ciclo volvia a ver la misma fila pendiente y la entregaba otra vez. Las colas reclaman sus filas,
 * asi que el daño estaba acotado, pero el trabajo se duplicaba y algunos efectos salian dos veces.
 *
 * Un ciclo que se salta no se pierde: el siguiente empieza igual y encuentra lo que quedo pendiente.
 */
export function startWorkerLoop(
  drain: WorkerDrain,
  schedule: IntervalScheduler = (callback, intervalMs) => setInterval(callback, intervalMs)
): unknown {
  let enCurso = false;

  const correr = (): void => {
    if (enCurso) return;
    enCurso = true;
    void drain()
      .catch((error: unknown) => {
        // El ciclo no se cae en silencio: se registra y el siguiente lo reintenta. Un fallo del
        // drenaje no puede tumbar el bucle, o el trabajador dejaria de mirar la cola.
        console.error(
          JSON.stringify({
            error: error instanceof Error ? error.message : 'desconocido',
            event: 'worker.cycle_failed'
          })
        );
      })
      .finally(() => {
        enCurso = false;
      });
  };

  correr();
  return schedule(correr, 5_000);
}
