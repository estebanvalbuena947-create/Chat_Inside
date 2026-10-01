import { describe, expect, it } from 'vitest';
import { advanceMessageStatus } from './messages';

describe('message status policy', () => {
  it.each([
    ['draft', 'queued', 'queued'],
    ['queued', 'sending', 'sending'],
    ['sent', 'delivered', 'delivered'],
    ['delivered', 'read', 'read']
  ] as const)('advances %s to %s', (current, incoming, expected) => {
    expect(advanceMessageStatus(current, incoming)).toBe(expected);
  });

  it.each([
    ['read', 'sent'],
    ['delivered', 'sending'],
    ['sending', 'queued']
  ] as const)('does not regress %s when %s arrives late', (current, incoming) => {
    expect(advanceMessageStatus(current, incoming)).toBe(current);
  });

  it('records a failure without allowing later events to hide it', () => {
    expect(advanceMessageStatus('sending', 'failed')).toBe('failed');
    expect(advanceMessageStatus('failed', 'read')).toBe('failed');
  });

  it('keeps inbound received state outside the outbound delivery progression', () => {
    expect(advanceMessageStatus('received', 'read')).toBe('received');
    expect(advanceMessageStatus('sent', 'received')).toBe('sent');
  });
});
