import type { MessageStatus } from '@chat-zernio/contracts';

const statusRank: Readonly<Record<Exclude<MessageStatus, 'failed' | 'received'>, number>> = {
  draft: 0,
  queued: 1,
  sending: 2,
  sent: 3,
  delivered: 4,
  read: 5
};

export function advanceMessageStatus(
  current: MessageStatus,
  incoming: MessageStatus
): MessageStatus {
  if (current === 'received') return current;
  if (incoming === 'received') return current;
  if (current === 'failed') return current;
  if (incoming === 'failed') return 'failed';
  return statusRank[incoming] >= statusRank[current] ? incoming : current;
}
