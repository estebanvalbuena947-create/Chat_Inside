import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInboxEventRefresh } from './inbox-event-refresh';

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('event refresh', () => {
  it('never refreshes an idle connection and groups a burst', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const s = createInboxEventRefresh({ refresh, pendingReads: () => [], isVisible: () => true });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).not.toHaveBeenCalled();
    for (let i = 0; i < 20; i++) s.request();
    await vi.advanceTimersByTimeAsync(200);
    expect(refresh).toHaveBeenCalledTimes(1);
    s.dispose();
  });
  it('waits for in-flight reads including failures and performs one follow-up', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    let reject!: (error: Error) => void;
    const read = new Promise<void>((_resolve, no) => {
      reject = no;
    });
    const s = createInboxEventRefresh({
      refresh,
      pendingReads: () => [read],
      isVisible: () => true
    });
    s.request();
    await vi.advanceTimersByTimeAsync(200);
    s.request();
    expect(refresh).not.toHaveBeenCalled();
    reject(new Error('read failed'));
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);
    s.dispose();
  });
  it('defers hidden-tab work and resynchronizes on return', async () => {
    vi.useFakeTimers();
    let visible = false;
    const refresh = vi.fn();
    const s = createInboxEventRefresh({
      refresh,
      pendingReads: () => [],
      isVisible: () => visible
    });
    s.request();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh).not.toHaveBeenCalled();
    visible = true;
    s.resume();
    await vi.advanceTimersByTimeAsync(200);
    expect(refresh).toHaveBeenCalledTimes(1);
    s.dispose();
  });
  it('cancels queued work when the component unmounts', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const s = createInboxEventRefresh({ refresh, pendingReads: () => [], isVisible: () => true });
    s.request();
    s.dispose();
    await vi.advanceTimersByTimeAsync(200);
    expect(refresh).not.toHaveBeenCalled();
  });
});
