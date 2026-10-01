import {
  applyInboundMessage,
  attachmentKindFromProvider,
  repairMojibake,
  type AttachmentKind
} from '@chat-zernio/domain';
import { z } from 'zod';

const identifierSchema = z.string().trim().min(1).max(300);
const platformSchema = z.string().trim().min(1).max(64);

const zernioInboundPayloadSchema = z.object({
  account: z.object({
    displayName: z.string().trim().min(1).max(160).nullish(),
    id: identifierSchema,
    username: z.string().trim().min(1).max(160).nullish()
  }),
  conversation: z.object({ id: identifierSchema }),
  event: z.literal('message.received'),
  message: z.object({
    id: identifierSchema,
    platform: platformSchema.nullish(),
    sender: z.object({
      contactId: identifierSchema.nullish(),
      id: identifierSchema,
      name: z.string().trim().min(1).max(160).nullish(),
      picture: z.string().max(2048).nullish(),
      phoneNumber: z.string().trim().min(1).max(160).nullish(),
      username: z.string().trim().min(1).max(160).nullish()
    }),
    // El proveedor envia null explicito cuando un mensaje no trae texto: por ejemplo, una
    // publicacion compartida sin comentario. Un null en un campo opcional nunca puede
    // rechazar el mensaje ni perderlo.
    text: z
      .string()
      .max(8000)
      .nullish()
      .transform((value) => value ?? ''),
    // La multimedia llega como enlace externo y puede venir sin el: una publicacion
    // compartida no trae archivo. El adjunto se lee de forma tolerante a proposito: un
    // adjunto con una forma inesperada nunca puede rechazar el mensaje ni perderlo.
    attachments: z.unknown().transform((value) => (Array.isArray(value) ? value : []))
  }),
  timestamp: z.string().datetime({ offset: true })
});

export type NormalizedInboundMessage = {
  accountId: string;
  accountName: string | null;
  attachments: Array<{
    kind: AttachmentKind;
    ordinal: number;
    sourceKind: string | null;
    sourceUrl: string | null;
    title: string | null;
  }>;
  avatarSourceUrl: string | null;
  body: string;
  contactDisplayName: string;
  contactReference: string;
  contactUsername: string | null;
  conversationReference: string;
  messageReference: string;
  platform: string | null;
  receivedAt: string;
};

export class InboundPayloadError extends Error {
  constructor() {
    super('El evento message.received no tiene el formato esperado.');
  }
}

function externalReference(accountId: string, kind: string, providerId: string): string {
  return `zernio:${accountId}:${kind}:${providerId}`;
}

function normalizeAvatarSourceUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeInboundMessage(payload: unknown): NormalizedInboundMessage {
  const parsed = zernioInboundPayloadSchema.safeParse(payload);

  if (!parsed.success) {
    throw new InboundPayloadError();
  }

  const { account, conversation, message, timestamp } = parsed.data;
  const contactId = message.sender.contactId ?? message.sender.id;
  const contactDisplayName =
    message.sender.name ??
    message.sender.username ??
    message.sender.phoneNumber ??
    message.sender.id;

  return {
    accountId: account.id,
    // El usuario distingue dos cuentas de la misma plataforma mejor que el nombre comercial.
    accountName: account.username ?? account.displayName ?? null,
    attachments: message.attachments.flatMap((attachment, ordinal) => {
      if (!attachment || typeof attachment !== 'object') return [];
      const entry = attachment as {
        originalType?: unknown;
        payload?: unknown;
        type?: unknown;
        url?: unknown;
      };
      const payload =
        entry.payload && typeof entry.payload === 'object'
          ? (entry.payload as { title?: unknown; url?: unknown })
          : null;

      return [
        {
          kind: attachmentKindFromProvider(entry.type),
          ordinal,
          sourceKind:
            typeof entry.originalType === 'string' ? entry.originalType.slice(0, 64) : null,
          sourceUrl: normalizeAvatarSourceUrl(
            typeof entry.url === 'string'
              ? entry.url
              : typeof payload?.url === 'string'
                ? payload.url
                : null
          ),
          // El texto de la publicacion compartida es el contexto que el equipo necesita.
          title: typeof payload?.title === 'string' ? repairMojibake(payload.title) : null
        }
      ];
    }),
    avatarSourceUrl: normalizeAvatarSourceUrl(message.sender.picture),
    body: message.text,
    contactDisplayName,
    contactReference: externalReference(account.id, 'contact', contactId),
    contactUsername: message.sender.username ?? null,
    conversationReference: externalReference(account.id, 'conversation', conversation.id),
    messageReference: externalReference(account.id, 'message', message.id),
    platform: message.platform ?? null,
    receivedAt: timestamp
  };
}

export function inboundConversationStatus(currentStatus: 'open' | 'pending' | 'resolved') {
  return applyInboundMessage(currentStatus);
}

const zernioSentPayloadSchema = z.object({
  account: z.object({ id: identifierSchema, username: z.string().trim().max(160).nullish() }),
  conversation: z.object({
    id: identifierSchema,
    participantId: identifierSchema.nullish(),
    participantName: z.string().trim().max(160).nullish(),
    participantPicture: z.string().max(2048).nullish(),
    participantUsername: z.string().trim().max(160).nullish()
  }),
  message: z.object({
    id: identifierSchema,
    sentAt: z.string().datetime({ offset: true }).nullish(),
    text: z
      .string()
      .max(8000)
      .nullish()
      .transform((value) => value ?? '')
  }),
  timestamp: z.string().datetime({ offset: true })
});

export type NormalizedSentMessage = NormalizedInboundMessage;

/**
 * Un mensaje saliente que no enviamos nosotros: lo manda la automatizacion del proveedor.
 * El equipo necesita verlo en el hilo igual que sus propias respuestas.
 */
export function normalizeSentMessage(payload: unknown): NormalizedSentMessage {
  const parsed = zernioSentPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new InboundPayloadError();
  }
  const { account, conversation, message, timestamp } = parsed.data;
  const contactId = conversation.participantId ?? conversation.id;

  return {
    accountId: account.id,
    accountName: account.username ?? null,
    attachments: [],
    avatarSourceUrl: normalizeAvatarSourceUrl(conversation.participantPicture),
    body: message.text,
    contactDisplayName:
      conversation.participantName ?? conversation.participantUsername ?? contactId,
    contactReference: externalReference(account.id, 'contact', contactId),
    contactUsername: conversation.participantUsername ?? null,
    conversationReference: externalReference(account.id, 'conversation', conversation.id),
    messageReference: externalReference(account.id, 'message', message.id),
    platform: null,
    receivedAt: message.sentAt ?? timestamp
  };
}

const zernioConversationStartedSchema = z.object({
  account: z.object({ id: identifierSchema }),
  conversation: z.object({ id: identifierSchema }),
  startedAt: z.string().datetime({ offset: true }),
  timestamp: z.string().datetime({ offset: true })
});

export type NormalizedConversationStarted = {
  accountId: string;
  conversationReference: string;
  startedAt: string;
};

/** El proveedor informa cuando empezo la conversacion: es el dato exacto, no una deduccion. */
export function normalizeConversationStarted(payload: unknown): NormalizedConversationStarted {
  const parsed = zernioConversationStartedSchema.safeParse(payload);
  if (!parsed.success) {
    throw new InboundPayloadError();
  }
  const { account, conversation, startedAt } = parsed.data;

  return {
    accountId: account.id,
    conversationReference: externalReference(account.id, 'conversation', conversation.id),
    startedAt
  };
}

const zernioCommentSchema = z.object({
  account: z.object({ id: identifierSchema }),
  comment: z.object({
    author: z.object({ id: identifierSchema, username: z.string().trim().max(160).nullish() }),
    createdAt: z.string().datetime({ offset: true }),
    id: identifierSchema,
    text: z
      .string()
      .max(8000)
      .nullish()
      .transform((value) => value ?? '')
  }),
  timestamp: z.string().datetime({ offset: true })
});

export type NormalizedComment = {
  accountId: string;
  body: string;
  commentReference: string;
  conversationReference: string;
  contactDisplayName: string;
  contactReference: string;
  contactUsername: string | null;
  receivedAt: string;
};

/**
 * Un comentario en una publicacion.
 *
 * No trae conversacion: llega por la publicacion, no por un mensaje directo. Por eso se
 * localiza a la persona por su contacto y el comentario se guarda en la conversacion que ya
 * tenga; si no la tiene, se deja constancia y el mensaje directo la creara.
 */
export function normalizeComment(payload: unknown): NormalizedComment {
  const parsed = zernioCommentSchema.safeParse(payload);
  if (!parsed.success) {
    throw new InboundPayloadError();
  }
  const { account, comment, timestamp } = parsed.data;

  return {
    accountId: account.id,
    body: comment.text,
    commentReference: externalReference(account.id, 'comment', comment.id),
    conversationReference: externalReference(account.id, 'comment-thread', comment.author.id),
    contactDisplayName: comment.author.username ?? comment.author.id,
    contactReference: externalReference(account.id, 'contact', comment.author.id),
    contactUsername: comment.author.username ?? null,
    receivedAt: comment.createdAt ?? timestamp
  };
}
