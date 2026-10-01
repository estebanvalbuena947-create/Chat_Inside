import { agentOutputSchema } from '@chat-zernio/contracts';
import { describe, expect, it } from 'vitest';

describe('agent output contract', () => {
  const base = {
    labels: { add: [], remove: [] },
    confidence: 0.9,
    reasonCode: 'GENERAL_RESPONSE'
  };

  it('accepts a reply with internal media identifiers', () => {
    const result = agentOutputSchema.parse({
      ...base,
      action: 'reply',
      reply: { text: 'Hola', mediaAssetIds: ['f556a4e9-b907-4b4e-9306-2b3e59bfcd9b'] },
      handoff: null
    });

    expect(result.reply?.mediaAssetIds).toHaveLength(1);
  });

  it('rejects a reply without reply content', () => {
    expect(() => agentOutputSchema.parse({ ...base, action: 'reply', handoff: null })).toThrow(
      'reply is required'
    );
  });

  it('rejects a handoff without handoff context', () => {
    expect(() => agentOutputSchema.parse({ ...base, action: 'handoff', handoff: null })).toThrow(
      'handoff is required'
    );
  });

  it('rejects unknown fields and external media URLs', () => {
    expect(() =>
      agentOutputSchema.parse({
        ...base,
        action: 'reply',
        reply: { text: 'Hola', mediaAssetIds: ['https://external.example/file.jpg'] },
        handoff: null,
        url: 'https://external.example/file.jpg'
      })
    ).toThrow();
  });
});
