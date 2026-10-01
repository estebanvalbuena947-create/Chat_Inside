import { describe, expect, it, vi } from 'vitest';
import { requestAgentDecision } from './agent-gateway';

const input = {
  correlationId: '11111111-1111-4111-8111-111111111111',
  conversationId: '22222222-2222-4222-8222-222222222222',
  messageId: '33333333-3333-4333-8333-333333333333',
  messageText: 'Hola, necesito informacion.',
  tenantId: '44444444-4444-4444-8444-444444444444'
};

describe('Agent Gateway foundation', () => {
  it('calls the transport only for an automatic conversation and validates its response', async () => {
    const transport = {
      request: vi.fn().mockResolvedValue({
        action: 'reply',
        confidence: 0.9,
        handoff: null,
        labels: { add: [], remove: [] },
        reasonCode: 'GENERAL_RESPONSE',
        reply: { mediaAssetIds: [], text: 'Hola, con gusto te ayudo.' }
      })
    };

    await expect(requestAgentDecision(transport, 'auto', input)).resolves.toMatchObject({
      kind: 'decision',
      output: { action: 'reply' }
    });
    expect(transport.request).toHaveBeenCalledWith(input);
  });

  it.each(['paused', 'suggest'] as const)(
    'does not call the transport when automation is %s',
    async (automationMode) => {
      const transport = { request: vi.fn() };

      await expect(requestAgentDecision(transport, automationMode, input)).resolves.toEqual({
        kind: 'skipped',
        reason: 'automation_not_auto'
      });
      expect(transport.request).not.toHaveBeenCalled();
    }
  );

  it('rejects an invalid response before it can become an internal decision', async () => {
    const transport = { request: vi.fn().mockResolvedValue({ action: 'reply' }) };

    await expect(requestAgentDecision(transport, 'auto', input)).rejects.toThrow();
  });
});
