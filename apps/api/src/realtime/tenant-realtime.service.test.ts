import { afterEach, describe, expect, it, vi } from 'vitest';
import { TenantRealtimeService } from './tenant-realtime.service';

function setup() {
  vi.useFakeTimers();
  const channels: {
    topic: string;
    event: () => void;
    status: (status: string) => void;
  }[] = [];
  const removeChannel = vi.fn().mockResolvedValue('ok');
  const from = vi.fn(() => {
    throw new Error('Polling tables is forbidden');
  });
  const channel = vi.fn((topic: string) => {
    const callbacks = { topic, event: () => {}, status: (_status: string) => {} };
    channels.push(callbacks);
    const instance = {
      on: vi.fn((_type: unknown, _filter: unknown, callback: () => void) => {
        callbacks.event = callback;
        return instance;
      }),
      subscribe: vi.fn((callback: (status: string) => void) => {
        callbacks.status = callback;
        return instance;
      })
    };
    return instance;
  });
  const authenticate = vi.fn().mockResolvedValue({ userId: 'user-1' });
  const assertMembership = vi.fn().mockResolvedValue(undefined);
  const service = new TenantRealtimeService(
    { authenticate } as never,
    { assertMembership } as never,
    { create: () => ({ channel, from, removeChannel }) } as never
  );
  return { service, channels, channel, from, removeChannel, authenticate, assertMembership };
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('TenantRealtimeService', () => {
  it('checks session and membership without subscribing unauthorized users', async () => {
    const s = setup();
    s.assertMembership.mockRejectedValue(new Error('forbidden'));
    await expect(s.service.authorize('Bearer session', 'tenant-a')).rejects.toThrow('forbidden');
    expect(s.authenticate).toHaveBeenCalledWith('Bearer session');
    expect(s.assertMembership).toHaveBeenCalledWith('user-1', 'tenant-a');
    expect(s.channel).not.toHaveBeenCalled();
  });

  it('shares one private subscription among ten clients without querying idle tables', () => {
    const s = setup();
    for (let i = 0; i < 10; i++) s.service.subscribe('tenant-a', vi.fn());
    expect(s.channel).toHaveBeenCalledExactlyOnceWith('inbox:tenant-a', {
      config: { private: true }
    });
    s.channels[0].status('SUBSCRIBED');
    vi.advanceTimersByTime(120_000);
    expect(s.from).not.toHaveBeenCalled();
    expect(s.removeChannel).not.toHaveBeenCalled();
    s.service.onModuleDestroy();
  });

  it('resynchronizes after subscribing and for clients joining a ready channel', () => {
    const s = setup();
    const first = vi.fn();
    const second = vi.fn();
    s.service.subscribe('tenant-a', first);
    expect(first).not.toHaveBeenCalled();
    s.channels[0].status('SUBSCRIBED');
    s.service.subscribe('tenant-a', second);
    expect(first).toHaveBeenCalledWith({ event: 'inbox.resync', cursor: expect.any(String) });
    expect(second).toHaveBeenCalledWith({ event: 'inbox.resync', cursor: expect.any(String) });
    s.service.onModuleDestroy();
  });

  it('groups bursts and isolates tenants without forwarding provider payloads', () => {
    const s = setup();
    const a = vi.fn();
    const b = vi.fn();
    s.service.subscribe('tenant-a', a);
    s.service.subscribe('tenant-b', b);
    s.channels.forEach((c) => c.status('SUBSCRIBED'));
    a.mockClear();
    b.mockClear();
    for (let i = 0; i < 20; i++) s.channels[0].event();
    vi.advanceTimersByTime(200);
    expect(a).toHaveBeenCalledTimes(1);
    expect(a.mock.calls[0][0]).toEqual({ event: 'inbox.changed', cursor: expect.any(String) });
    expect(b).not.toHaveBeenCalled();
    s.service.onModuleDestroy();
  });

  it('releases the channel after the last client and cancels pending notifications', () => {
    const s = setup();
    const listener = vi.fn();
    const first = s.service.subscribe('tenant-a', listener);
    const last = s.service.subscribe('tenant-a', vi.fn());
    s.channels[0].status('SUBSCRIBED');
    listener.mockClear();
    s.channels[0].event();
    first();
    expect(s.removeChannel).not.toHaveBeenCalled();
    last();
    vi.advanceTimersByTime(30_000);
    expect(s.removeChannel).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'])(
    'closes clients on %s and lets a new subscription recover',
    (status) => {
      const s = setup();
      const listener = vi.fn();
      s.service.subscribe('tenant-a', listener);
      s.channels[0].status('SUBSCRIBED');
      listener.mockClear();
      s.channels[0].status(status);
      expect(listener).toHaveBeenCalledWith({ event: 'inbox.offline', cursor: expect.any(String) });
      s.service.subscribe('tenant-a', listener);
      s.channels[1].status('SUBSCRIBED');
      expect(listener).toHaveBeenLastCalledWith({
        event: 'inbox.resync',
        cursor: expect.any(String)
      });
      s.service.onModuleDestroy();
    }
  );

  it('does not leave SSE hanging when subscription establishment stalls', () => {
    const s = setup();
    const listener = vi.fn();
    s.service.subscribe('tenant-a', listener);
    vi.advanceTimersByTime(10_000);
    expect(listener).toHaveBeenCalledWith({ event: 'inbox.offline', cursor: expect.any(String) });
    expect(s.removeChannel).toHaveBeenCalledTimes(1);
  });
});
