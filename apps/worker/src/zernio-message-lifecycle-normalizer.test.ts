import { describe, expect, it } from 'vitest';
import {
  MessageLifecyclePayloadError,
  normalizeMessageLifecycle
} from './zernio-message-lifecycle-normalizer';

describe('normalizeMessageLifecycle', () => {
  it.each([
    ['message.sent', 'sent'],
    ['message.delivered', 'delivered'],
    ['message.read', 'read'],
    ['message.failed', 'failed']
  ] as const)('normalizes %s without inspecting message content', (event, status) => {
    expect(
      normalizeMessageLifecycle({
        account: { id: 'account-1' },
        event,
        message: { id: 'message-1' },
        timestamp: '2026-08-14T12:00:00Z'
      })
    ).toEqual({
      accountId: 'account-1',
      messageReference: 'zernio:account-1:message:message-1',
      status,
      statusAt: '2026-08-14T12:00:00Z'
    });
  });

  it('rejects an event without an account/message identity', () => {
    expect(() => normalizeMessageLifecycle({ event: 'message.read' })).toThrow(
      MessageLifecyclePayloadError
    );
  });

  it('prioritizes the platform message identity used by the outbound response', () => {
    expect(
      normalizeMessageLifecycle({
        account: { id: 'account-1' },
        event: 'message.read',
        message: { id: 'zernio-message-1', platformMessageId: 'platform-message-1' },
        timestamp: '2026-08-14T12:00:00Z'
      })
    ).toEqual({
      accountId: 'account-1',
      messageReference: 'zernio:account-1:message:platform-message-1',
      status: 'read',
      statusAt: '2026-08-14T12:00:00Z'
    });
  });
});
