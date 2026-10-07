import { describe, expect, it, vi } from 'vitest';
import { normalizeSentMessage } from './zernio-inbound-normalizer';
import { recordAutomationMessage } from './zernio-inbox-worker';

const payload = {
  account: { id: 'account-1', platform: 'instagram' },
  conversation: { id: 'conversation-1' },
  event: 'message.sent',
  message: {
    id: 'message-1',
    sentAt: '2026-09-30T15:11:22.607Z',
    text: 'Si deseas validar una transferencia, comparte el comprobante.'
  },
  timestamp: '2026-09-30T15:11:27.341Z'
};

type Recorded = { args: unknown[]; method: string };

function createClient(input: {
  conversation?: unknown;
  created?: unknown;
  insertError?: { code: string } | null;
}) {
  const calls: Recorded[] = [];
  const conversationBuilder: Record<string, unknown> = {};
  for (const method of ['eq', 'select']) {
    conversationBuilder[method] = vi.fn((...args: unknown[]) => {
      calls.push({ args, method });
      return conversationBuilder;
    });
  }
  // La primera lectura busca la conversacion; si no existe, la segunda devuelve la creada.
  const conversationReads = [input.conversation ?? null, input.created ?? null];
  let readIndex = 0;
  conversationBuilder.maybeSingle = vi.fn(() => {
    const value = conversationReads[Math.min(readIndex, conversationReads.length - 1)];
    readIndex += 1;
    return Promise.resolve({ data: value ?? null, error: null });
  });
  // El alta de la conversacion devuelve la fila creada.
  conversationBuilder.single = vi.fn(() =>
    Promise.resolve({ data: input.created ?? null, error: null })
  );
  conversationBuilder.insert = vi.fn((payloadValue: unknown) => {
    calls.push({ args: [payloadValue], method: 'conversations.insert' });
    return conversationBuilder;
  });
  conversationBuilder.update = vi.fn((payloadValue: unknown) => {
    calls.push({ args: [payloadValue], method: 'update' });
    return conversationBuilder;
  });

  const contactBuilder: Record<string, unknown> = {};
  for (const method of ['select', 'upsert']) {
    contactBuilder[method] = vi.fn((...args: unknown[]) => {
      calls.push({ args, method: `contacts.${method}` });
      return contactBuilder;
    });
  }
  contactBuilder.single = vi.fn(() => Promise.resolve({ data: { id: 'contact-1' }, error: null }));

  const messageBuilder: Record<string, unknown> = {
    insert: vi.fn((payloadValue: unknown) => {
      calls.push({ args: [payloadValue], method: 'insert' });
      return Promise.resolve({ data: null, error: input.insertError ?? null });
    })
  };

  const client = {
    from: (table: string) => {
      if (table === 'conversations') return conversationBuilder;
      if (table === 'contacts') return contactBuilder;
      return messageBuilder;
    }
  };
  return { calls, client };
}

describe('normalizeSentMessage', () => {
  it('traduce un mensaje saliente del proveedor a nuestras referencias', () => {
    expect(normalizeSentMessage(payload)).toMatchObject({
      body: payload.message.text,
      conversationReference: 'zernio:account-1:conversation:conversation-1',
      messageReference: 'zernio:account-1:message:message-1',
      receivedAt: '2026-09-30T15:11:22.607Z'
    });
  });

  it('un texto nulo no invalida el mensaje: la automatizacion puede enviar solo un adjunto', () => {
    const normalized = normalizeSentMessage({
      ...payload,
      message: { ...payload.message, text: null }
    });
    expect(normalized.body).toBe('');
  });
});

describe('recordAutomationMessage', () => {
  it('guarda la respuesta de la automatizacion en su conversacion', async () => {
    const { calls, client } = createClient({
      conversation: {
        id: 'conversation-1',
        last_message_at: null,
        status: 'open',
        status_version: 1
      }
    });

    await expect(
      recordAutomationMessage(client as never, payload, 'tenant-1', 'channel-1')
    ).resolves.toBeUndefined();

    expect(calls).toContainEqual({
      args: [
        expect.objectContaining({
          body: payload.message.text,
          conversation_id: 'conversation-1',
          direction: 'outbound',
          provider_message_id: 'zernio:account-1:message:message-1',
          sender_type: 'automation',
          status: 'sent'
        })
      ],
      method: 'insert'
    });
    expect(calls).toContainEqual({
      args: [expect.objectContaining({ last_message_at: payload.message.sentAt })],
      method: 'update'
    });
  });

  it('crea contacto y conversacion cuando el bot abre la conversacion', async () => {
    const { calls, client } = createClient({
      conversation: null,
      created: { id: 'conversation-9', last_message_at: null, status: 'open', status_version: 1 }
    });

    await expect(
      recordAutomationMessage(client as never, payload, 'tenant-1', 'channel-1')
    ).resolves.toBeUndefined();

    expect(calls).toContainEqual({
      args: [
        expect.objectContaining({
          external_reference: 'zernio:account-1:contact:conversation-1',
          tenant_id: 'tenant-1'
        }),
        expect.anything()
      ],
      method: 'contacts.upsert'
    });
    expect(calls).toContainEqual({
      args: [
        expect.objectContaining({
          channel_account_id: 'channel-1',
          contact_id: 'contact-1',
          external_reference: 'zernio:account-1:conversation:conversation-1'
        })
      ],
      method: 'conversations.insert'
    });
    expect(calls).toContainEqual({
      args: [expect.objectContaining({ conversation_id: 'conversation-9' })],
      method: 'insert'
    });
  });

  it('un mensaje ya guardado no rompe el proceso ni se duplica', async () => {
    const { client } = createClient({
      conversation: {
        id: 'conversation-1',
        last_message_at: null,
        status: 'open',
        status_version: 1
      },
      insertError: { code: '23505' }
    });

    await expect(
      recordAutomationMessage(client as never, payload, 'tenant-1', 'channel-1')
    ).resolves.toBeUndefined();
  });
});
