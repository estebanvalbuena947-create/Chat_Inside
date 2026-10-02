import { describe, expect, it } from 'vitest';
import {
  InboundPayloadError,
  inboundConversationStatus,
  normalizeInboundMessage
} from './zernio-inbound-normalizer';

const payload = {
  account: { id: 'account-1' },
  conversation: { id: 'conversation-1' },
  event: 'message.received',
  message: {
    id: 'message-1',
    platform: 'instagram',
    sender: {
      id: 'sender-1',
      picture: 'https://cdn.example.test/avatar.jpg',
      username: 'inside.client'
    },
    text: 'Hola'
  },
  timestamp: '2026-08-13T20:00:00.000Z'
};

describe('normalizeInboundMessage', () => {
  it('uses only provider IDs scoped to the source account', () => {
    expect(normalizeInboundMessage(payload)).toEqual({
      accountId: 'account-1',
      attachments: [],
      accountName: null,
      avatarSourceUrl: 'https://cdn.example.test/avatar.jpg',
      body: 'Hola',
      contactDisplayName: 'inside.client',
      contactReference: 'zernio:account-1:contact:sender-1',
      contactUsername: 'inside.client',
      conversationReference: 'zernio:account-1:conversation:conversation-1',
      messageReference: 'zernio:account-1:message:message-1',
      platform: 'instagram',
      receivedAt: '2026-08-13T20:00:00.000Z'
    });
  });

  it('prefers the account username over its commercial name to tell two accounts apart', () => {
    expect(
      normalizeInboundMessage({
        ...payload,
        account: { displayName: 'Inside Spa', id: 'account-1', username: 'insidespamx' }
      }).accountName
    ).toBe('insidespamx');
  });

  it('falls back to the account display name, and to nothing when neither arrives', () => {
    expect(
      normalizeInboundMessage({
        ...payload,
        account: { displayName: 'Inside Spa', id: 'account-1', username: null }
      }).accountName
    ).toBe('Inside Spa');
    expect(
      normalizeInboundMessage({
        ...payload,
        account: { displayName: null, id: 'account-1', username: null }
      }).accountName
    ).toBeNull();
  });

  it('ignores an unsafe avatar URL without rejecting an otherwise valid message', () => {
    expect(
      normalizeInboundMessage({
        ...payload,
        message: { ...payload.message, sender: { ...payload.message.sender, picture: 'http://x' } }
      }).avatarSourceUrl
    ).toBeNull();
  });

  it('rejects an event that cannot identify its account, conversation, sender and message', () => {
    expect(() => normalizeInboundMessage({ event: 'message.received' })).toThrow(
      InboundPayloadError
    );
  });

  it('keeps a shared post without comment, which the provider sends with a null text', () => {
    const result = normalizeInboundMessage({
      ...payload,
      message: {
        ...payload.message,
        attachments: [{ originalType: 'ig_post', type: 'share' }],
        text: null
      }
    });

    expect(result.body).toBe('');
    expect(result.messageReference).toBe('zernio:account-1:message:message-1');
  });

  it('treats an explicit null in any optional field as absent, never as a broken message', () => {
    const result = normalizeInboundMessage({
      ...payload,
      message: {
        ...payload.message,
        platform: null,
        text: null,
        sender: {
          ...payload.message.sender,
          contactId: null,
          name: null,
          phoneNumber: null,
          picture: null,
          username: null
        }
      }
    });

    expect(result).toMatchObject({
      avatarSourceUrl: null,
      body: '',
      contactDisplayName: 'sender-1',
      contactReference: 'zernio:account-1:contact:sender-1',
      contactUsername: null,
      platform: null
    });
  });

  it('reopens only resolved conversations', () => {
    expect(inboundConversationStatus('resolved')).toBe('open');
    expect(inboundConversationStatus('pending')).toBe('pending');
  });
});

describe('normalizeInboundMessage multimedia', () => {
  const base = {
    account: { id: 'account-1', username: 'insidespamx' },
    conversation: { id: 'conversation-1' },
    event: 'message.received',
    message: {
      id: 'message-1',
      platform: 'instagram',
      sender: { contactId: 'contact-1', id: 'contact-1', name: 'Ivan' },
      text: null
    },
    timestamp: '2026-09-29T03:57:56.761Z'
  };

  it('normaliza la multimedia con su tipo, su posicion y el enlace del adjunto', () => {
    const normalized = normalizeInboundMessage({
      ...base,
      message: {
        ...base.message,
        attachments: [
          { payload: { url: 'https://cdn.example.test/foto.jpg' }, type: 'image', url: null },
          { type: 'share' },
          { type: 'sticker', url: 'https://cdn.example.test/raro.webp' }
        ]
      }
    });

    expect(normalized.attachments).toEqual([
      {
        kind: 'image',
        ordinal: 0,
        sourceKind: null,
        sourceUrl: 'https://cdn.example.test/foto.jpg',
        title: null
      },
      { kind: 'share', ordinal: 1, sourceKind: null, sourceUrl: null, title: null },
      {
        kind: 'file',
        ordinal: 2,
        sourceKind: null,
        sourceUrl: 'https://cdn.example.test/raro.webp',
        title: null
      }
    ]);
    expect(normalized.body).toBe('');
  });

  it('conserva la imagen y el texto de una publicacion compartida para copiarlos como multimedia', () => {
    const normalized = normalizeInboundMessage({
      ...base,
      message: { ...base.message, attachments: [{ type: 'share' }] },
      post: {
        content: 'Una publicación completa, sin texto cortado.',
        imageUrl: 'https://cdn.example.test/publicacion.jpg'
      }
    });

    expect(normalized.attachments).toEqual([
      {
        kind: 'share',
        ordinal: 0,
        sourceKind: null,
        sourceUrl: 'https://cdn.example.test/publicacion.jpg',
        title: 'Una publicación completa, sin texto cortado.'
      }
    ]);
  });

  it('un adjunto mal formado no invalida el mensaje', () => {
    const normalized = normalizeInboundMessage({
      ...base,
      message: { ...base.message, attachments: [{ type: 123, url: 'no-es-una-url' }] }
    });

    expect(normalized.attachments).toEqual([
      { kind: 'file', ordinal: 0, sourceKind: null, sourceUrl: null, title: null }
    ]);
  });
});
