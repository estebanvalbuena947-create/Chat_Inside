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
});
