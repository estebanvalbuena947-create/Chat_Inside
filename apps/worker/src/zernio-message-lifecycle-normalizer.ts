import { z } from 'zod';

const identifierSchema = z.string().trim().min(1).max(300);
const lifecycleEventSchema = z.enum([
  'message.sent',
  'message.delivered',
  'message.read',
  'message.failed'
]);

const lifecyclePayloadSchema = z.object({
  account: z.object({ id: identifierSchema }),
  event: lifecycleEventSchema,
  message: z.object({
    id: identifierSchema,
    platformMessageId: identifierSchema.optional()
  }),
  statusAt: z.string().datetime({ offset: true }).optional(),
  timestamp: z.string().datetime({ offset: true })
});

export type NormalizedMessageLifecycle = {
  accountId: string;
  messageReference: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  statusAt: string;
};

export class MessageLifecyclePayloadError extends Error {
  constructor() {
    super('El evento de ciclo de vida del mensaje no tiene el formato esperado.');
  }
}

export function normalizeMessageLifecycle(payload: unknown): NormalizedMessageLifecycle {
  const parsed = lifecyclePayloadSchema.safeParse(payload);
  if (!parsed.success) throw new MessageLifecyclePayloadError();

  const statusByEvent = {
    'message.delivered': 'delivered',
    'message.failed': 'failed',
    'message.read': 'read',
    'message.sent': 'sent'
  } as const;
  const { account, event, message, statusAt, timestamp } = parsed.data;
  return {
    accountId: account.id,
    messageReference: `zernio:${account.id}:message:${message.platformMessageId ?? message.id}`,
    status: statusByEvent[event],
    statusAt: statusAt ?? timestamp
  };
}
