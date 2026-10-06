export type WorkerDrain = () => Promise<void>;
export type IntervalScheduler = (callback: () => void, intervalMs: number) => unknown;

export function startWorkerLoop(
  drain: WorkerDrain,
  schedule: IntervalScheduler = (callback, intervalMs) => setInterval(callback, intervalMs)
): unknown {
  void drain();
  return schedule(() => void drain(), 5_000);
}
