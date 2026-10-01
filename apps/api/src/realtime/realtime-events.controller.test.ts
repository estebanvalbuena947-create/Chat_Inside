import { describe, expect, it } from 'vitest';
import { toSseFrame } from './realtime-events.controller';

describe('toSseFrame', () => {
  it('serializes an opaque event cursor without message content', () => {
    expect(toSseFrame({ cursor: 'opaque-cursor', event: 'inbox.changed' })).toBe(
      'id: opaque-cursor\nevent: inbox.changed\ndata: {"cursor":"opaque-cursor"}\n\n'
    );
  });
});
