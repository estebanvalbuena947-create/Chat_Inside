import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { RealtimeEventsController, toSseFrame } from './realtime-events.controller';
import type { RealtimeEvent } from './tenant-realtime.service';

describe('toSseFrame', () => {
  it('serializes an opaque event cursor without message content', () => {
    expect(toSseFrame({ cursor: 'opaque-cursor', event: 'inbox.changed' })).toBe(
      'id: opaque-cursor\nevent: inbox.changed\ndata: {"cursor":"opaque-cursor"}\n\n'
    );
  });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

function connection() {
  vi.useFakeTimers();
  const request = { raw: Object.assign(new EventEmitter(), { aborted: false }) };
  const response = Object.assign(new EventEmitter(), {
    setHeader: vi.fn(),
    write: vi.fn().mockReturnValue(true),
    writableEnded: false,
    destroyed: false,
    end: vi.fn()
  });
  response.end.mockImplementation(() => {
    response.writableEnded = true;
    response.emit('close');
  });
  const reply = { raw: response, hijack: vi.fn() };
  const stop = vi.fn();
  let notify!: (event: RealtimeEvent) => void;
  const service = {
    authorize: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn((_tenant: string, callback: typeof notify) => {
      notify = callback;
      return stop;
    })
  };
  const controller = new RealtimeEventsController(service as never);
  const start = () =>
    controller.stream(
      '00000000-0000-4000-8000-000000000001',
      'Bearer test',
      'legacy-cursor',
      request as never,
      reply as never
    );
  return {
    start,
    request,
    response,
    reply,
    service,
    stop,
    notify: (event: RealtimeEvent) => notify(event)
  };
}

describe('SSE connection lifecycle', () => {
  it('authorizes before hijacking or subscribing', async () => {
    const s = connection();
    s.service.authorize.mockRejectedValue(new Error('forbidden'));
    await expect(s.start()).rejects.toThrow('forbidden');
    expect(s.reply.hijack).not.toHaveBeenCalled();
    expect(s.service.subscribe).not.toHaveBeenCalled();
  });
  it('keeps the transport alive without requesting database snapshots and cleans up on close', async () => {
    const s = connection();
    await s.start();
    vi.advanceTimersByTime(60_000);
    expect(s.service.subscribe).toHaveBeenCalledTimes(1);
    expect(s.response.write).toHaveBeenCalledWith(': keepalive\n\n');
    s.response.emit('close');
    expect(s.stop).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('disconnects a slow client instead of growing its response buffer', async () => {
    const s = connection();
    await s.start();
    s.response.write.mockReturnValue(false);
    s.notify({ event: 'inbox.changed', cursor: 'opaque' });
    expect(s.response.end).toHaveBeenCalled();
    expect(s.stop).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('closes on a source failure and on a browser abort', async () => {
    const s = connection();
    await s.start();
    s.notify({ event: 'inbox.offline', cursor: 'opaque' });
    expect(s.response.end).toHaveBeenCalled();
    expect(s.stop).toHaveBeenCalledTimes(1);
    const other = connection();
    await other.start();
    other.request.raw.emit('aborted');
    expect(other.stop).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
