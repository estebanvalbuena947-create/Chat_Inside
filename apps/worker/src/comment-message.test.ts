import { describe, expect, it, vi } from 'vitest';
import { normalizeComment } from './zernio-inbound-normalizer';
import { recordComment } from './zernio-inbox-worker';

const payload = {
  account: { id: 'account-1', platform: 'instagram' },
  comment: {
    author: { id: 'author-1', username: 'alex.belmont' },
    createdAt: '2026-09-29T21:57:08.702Z',
    id: 'comment-1',
    text: 'No es que este en el spam, es que no lo vi.'
  },
  event: 'comment.received',
  timestamp: '2026-09-29T21:57:08.702Z'
};

type Recorded = { args: unknown[]; method: string };

function chainable(name: string, calls: Recorded[], terminal: unknown[]) {
  const builder: Record<string, unknown> = {};
  let index = 0;
  for (const method of ['eq', 'limit', 'order', 'select']) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push({ args, method: `${name}.${method}` });
      return builder;
    });
  }
  for (const method of ['insert', 'upsert', 'update']) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push({ args, method: `${name}.${method}` });
      return builder;
    });
  }
  builder.single = vi.fn(() =>
    Promise.resolve({ data: terminal[1] ?? terminal[0] ?? null, error: null })
  );
  builder.maybeSingle = vi.fn(() => {
    const value = terminal[Math.min(index, terminal.length - 1)] ?? null;
    index += 1;
    return Promise.resolve({ data: value, error: null });
  });
  return builder;
}

function createClient(input: {
  channel?: unknown;
  contact?: unknown;
  conversation?: unknown;
  openedConversation?: unknown;
}) {
  const calls: Recorded[] = [];
  const channels = chainable('channels', calls, [input.channel ?? null]);
  const contacts = chainable('contacts', calls, [input.contact ?? null, { id: 'contact-1' }]);
  const conversations = chainable('conversations', calls, [
    input.conversation ?? null,
    input.openedConversation ?? { id: 'conversation-9', last_message_at: null }
  ]);
  const messages: Record<string, unknown> = {
    insert: vi.fn((value: unknown) => {
      calls.push({ args: [value], method: 'messages.insert' });
      return Promise.resolve({ data: null, error: null });
    })
  };

  const client = {
    from: (table: string) => {
      if (table === 'channel_accounts') return channels;
      if (table === 'contacts') return contacts;
      if (table === 'conversations') return conversations;
      return messages;
    }
  };
  return { calls, client };
}

describe('normalizeComment', () => {
  it('traduce el comentario a la persona, al texto y a su hilo', () => {
    expect(normalizeComment(payload)).toEqual({
      accountId: 'account-1',
      body: 'No es que este en el spam, es que no lo vi.',
      commentReference: 'zernio:account-1:comment:comment-1',
      conversationReference: 'zernio:account-1:comment-thread:author-1',
      contactDisplayName: 'alex.belmont',
      contactReference: 'zernio:account-1:contact:author-1',
      contactUsername: 'alex.belmont',
      receivedAt: '2026-09-29T21:57:08.702Z'
    });
  });
});

describe('recordComment', () => {
  it('guarda el comentario en la conversacion que la persona ya tenia', async () => {
    const { calls, client } = createClient({
      channel: { id: 'channel-1' },
      contact: { id: 'contact-1' },
      conversation: { id: 'conversation-1', last_message_at: null }
    });

    await expect(recordComment(client as never, payload, 'tenant-1')).resolves.toBeUndefined();

    expect(calls).toContainEqual({
      args: [
        expect.objectContaining({
          body: payload.comment.text,
          conversation_id: 'conversation-1',
          direction: 'inbound',
          provider_message_id: 'zernio:account-1:comment:comment-1',
          sender_type: 'contact',
          source: 'comment',
          status: 'received'
        })
      ],
      method: 'messages.insert'
    });
    // La persona ya existia: no se crea ni contacto ni conversacion.
    expect(calls.find((call) => call.method === 'contacts.upsert')).toBeUndefined();
    expect(calls.find((call) => call.method === 'conversations.insert')).toBeUndefined();
  });

  it('si la persona no habia escrito nunca, el comentario abre su conversacion', async () => {
    const { calls, client } = createClient({ channel: { id: 'channel-1' } });

    await expect(recordComment(client as never, payload, 'tenant-1')).resolves.toBeUndefined();

    expect(calls).toContainEqual({
      args: [
        expect.objectContaining({
          external_reference: 'zernio:account-1:contact:author-1',
          tenant_id: 'tenant-1'
        }),
        expect.anything()
      ],
      method: 'contacts.upsert'
    });
    expect(calls).toContainEqual({
      args: [
        expect.objectContaining({
          contact_id: 'contact-1',
          external_reference: 'zernio:account-1:comment-thread:author-1',
          started_at: payload.comment.createdAt
        })
      ],
      method: 'conversations.insert'
    });
    expect(calls).toContainEqual({
      args: [expect.objectContaining({ conversation_id: 'conversation-9' })],
      method: 'messages.insert'
    });
  });

  it('sin canal asociado no escribe nada', async () => {
    const { calls, client } = createClient({ channel: null });

    await expect(recordComment(client as never, payload, 'tenant-1')).resolves.toBeUndefined();

    const escrituras = calls.filter((call) =>
      ['contacts.upsert', 'conversations.insert', 'messages.insert'].includes(call.method)
    );
    expect(escrituras).toHaveLength(0);
  });
});
