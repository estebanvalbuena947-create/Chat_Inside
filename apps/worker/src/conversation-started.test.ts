import { describe, expect, it, vi } from 'vitest';
import { normalizeConversationStarted } from './zernio-inbound-normalizer';
import { recordConversationStarted } from './zernio-inbox-worker';

const payload = {
  account: { id: 'account-1', platform: 'instagram' },
  conversation: { id: 'conversation-1' },
  event: 'conversation.started',
  startedAt: '2026-09-30T15:03:03.874Z',
  timestamp: '2026-09-30T15:03:05.184Z'
};

type Recorded = { args: unknown[]; method: string };

function createClient(input: { channel?: unknown; conversation?: unknown }) {
  const calls: Recorded[] = [];
  const channelBuilder: Record<string, unknown> = {
    eq: vi.fn(() => channelBuilder),
    maybeSingle: vi.fn(() => Promise.resolve({ data: input.channel ?? null, error: null })),
    select: vi.fn(() => channelBuilder)
  };
  const conversationBuilder: Record<string, unknown> = {};
  for (const method of ['eq', 'select']) {
    conversationBuilder[method] = vi.fn(() => conversationBuilder);
  }
  conversationBuilder.maybeSingle = vi.fn(() =>
    Promise.resolve({ data: input.conversation ?? null, error: null })
  );
  conversationBuilder.update = vi.fn((value: unknown) => {
    calls.push({ args: [value], method: 'update' });
    return conversationBuilder;
  });
  const client = {
    from: (table: string) => (table === 'channel_accounts' ? channelBuilder : conversationBuilder)
  };
  return { calls, client };
}

describe('normalizeConversationStarted', () => {
  it('traduce el inicio a nuestras referencias', () => {
    expect(normalizeConversationStarted(payload)).toEqual({
      accountId: 'account-1',
      conversationReference: 'zernio:account-1:conversation:conversation-1',
      startedAt: '2026-09-30T15:03:03.874Z'
    });
  });
});

describe('recordConversationStarted', () => {
  it('guarda el inicio cuando la conversacion no lo tenia', async () => {
    const { calls, client } = createClient({
      channel: { id: 'channel-1' },
      conversation: { id: 'conversation-1', started_at: null }
    });

    await expect(
      recordConversationStarted(client as never, payload, 'tenant-1')
    ).resolves.toBeUndefined();

    expect(calls).toContainEqual({
      args: [expect.objectContaining({ started_at: payload.startedAt })],
      method: 'update'
    });
  });

  it('no retrocede un inicio ya registrado mas antiguo', async () => {
    const { calls, client } = createClient({
      channel: { id: 'channel-1' },
      conversation: { id: 'conversation-1', started_at: '2026-09-30T14:00:00.000Z' }
    });

    await expect(
      recordConversationStarted(client as never, payload, 'tenant-1')
    ).resolves.toBeUndefined();

    expect(calls.find((call) => call.method === 'update')).toBeUndefined();
  });

  it('no hace nada si el canal o la conversacion no estan asociados todavia', async () => {
    const { calls, client } = createClient({ channel: null });

    await expect(
      recordConversationStarted(client as never, payload, 'tenant-1')
    ).resolves.toBeUndefined();

    expect(calls).toHaveLength(0);
  });
});
