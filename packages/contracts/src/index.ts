import { z } from 'zod';

export const conversationStatusSchema = z.enum(['open', 'pending', 'resolved']);
export const automationModeSchema = z.enum(['auto', 'suggest', 'paused']);
export const messageStatusSchema = z.enum([
  'received',
  'draft',
  'queued',
  'sending',
  'sent',
  'delivered',
  'read',
  'failed'
]);

export const tenantIdSchema = z.uuid();
export const tenantRoleSchema = z.enum(['admin', 'supervisor', 'agent']);
export const conversationAssignmentScopeSchema = z.enum(['all', 'assigned_to_me']);
export const zernioConnectPlatformSchema = z.enum(['facebook', 'instagram', 'tiktok', 'whatsapp']);

export const tenantSummarySchema = z.object({
  id: tenantIdSchema,
  name: z.string().min(1).max(120),
  role: tenantRoleSchema,
  slug: z.string().min(1).max(120)
});

export const tenantListResponseSchema = z.object({
  items: z.array(tenantSummarySchema)
});

export const zernioChannelSchema = z.object({
  createdAt: z.string().datetime(),
  displayName: z.string().min(1).max(160).nullable(),
  id: z.uuid(),
  platform: z.string().trim().min(1).max(64).nullable()
});

export const zernioChannelListResponseSchema = z.object({
  items: z.array(zernioChannelSchema)
});

export const startZernioChannelConnectionSchema = z.object({
  platform: zernioConnectPlatformSchema
});

export const startZernioChannelConnectionResponseSchema = z.object({
  authorizationUrl: z.string().url()
});

export const attachZernioChannelSchema = z.object({
  accountId: z.string().trim().min(1).max(120)
});

export const attachZernioChannelResponseSchema = z.object({
  item: zernioChannelSchema
});

export type AttachZernioChannel = z.infer<typeof attachZernioChannelSchema>;
export type AttachZernioChannelResponse = z.infer<typeof attachZernioChannelResponseSchema>;
export const renameZernioChannelSchema = z.object({
  displayName: z.string().trim().min(1).max(160)
});

export const renameZernioChannelResponseSchema = z.object({
  item: zernioChannelSchema
});

export const messageDirectionSchema = z.enum(['inbound', 'outbound']);
export const messageSenderTypeSchema = z.enum(['contact', 'agent', 'automation', 'system']);

export const conversationListQuerySchema = z.object({
  assignmentScope: conversationAssignmentScopeSchema.default('all'),
  cursor: z.string().trim().max(400).optional(),
  kind: z.enum(['messages', 'comments']).optional(),
  platform: z.string().trim().min(1).max(64).optional(),
  labelId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.string().trim().max(80).optional()
});

/**
 * Cuanto lleva esperando respuesta el cliente.
 *
 * Nulo cuando no hay nada pendiente: si el ultimo mensaje no es del cliente, ya se respondio.
 */
export const attentionLevelSchema = z.enum(['ok', 'aviso', 'alto']);

export type AttentionLevel = z.infer<typeof attentionLevelSchema>;

export const conversationSummarySchema = z.object({
  id: z.uuid(),
  contactId: z.uuid(),
  contactName: z.string().min(1).max(160),
  contactUsername: z.string().min(1).max(160).nullable(),
  contactAvatarAvailable: z.boolean(),
  attentionLevel: attentionLevelSchema.nullable(),
  assignedUserId: z.uuid().nullable(),
  channelPlatform: z.string().trim().min(1).max(64).nullable(),
  // Cuenta de canal del espacio (identificador nuestro, nunca el del proveedor). La interfaz la usa
  // para ofrecer solo lo que se puede enviar desde ESA cuenta y no desde otra del mismo espacio.
  channelAccountId: z.uuid().nullable(),
  status: conversationStatusSchema,
  automationMode: automationModeSchema,
  automationVersion: z.number().int().min(1),
  lastMessageAt: z.string().datetime().nullable(),
  lastMessageDirection: messageDirectionSchema.nullable(),
  lastMessagePreview: z.string().max(200).nullable(),
  needsAttention: z.boolean(),
  // Inicio de la conversacion segun el proveedor; nulo mientras no lo haya informado.
  startedAt: z.string().datetime().nullable(),
  statusVersion: z.number().int().min(1),
  assignmentVersion: z.number().int().min(1),
  updatedAt: z.string().datetime()
});

export const conversationListResponseSchema = z.object({
  items: z.array(conversationSummarySchema),
  nextCursor: z.string().nullable()
});

export const contactAvatarResponseSchema = z.object({
  url: z.string().url()
});

export const attachmentKindSchema = z.enum(['audio', 'file', 'image', 'share', 'video']);

export const messageAttachmentSchema = z.object({
  contentType: z.string().max(128).nullable(),
  id: z.uuid(),
  kind: attachmentKindSchema,
  // Texto de la publicacion compartida: el contexto para responder.
  title: z.string().max(4000).nullable(),
  // Enlace firmado de corto plazo a la copia propia. Vacio mientras no se haya podido copiar.
  url: z.url().nullable()
});

export const mediaItemSchema = z.object({
  contactId: z.uuid(),
  contactName: z.string().min(1).max(160),
  contentType: z.string().max(128).nullable(),
  conversationId: z.uuid(),
  createdAt: z.string().datetime(),
  id: z.uuid(),
  kind: attachmentKindSchema,
  messageId: z.uuid(),
  title: z.string().max(4000).nullable(),
  url: z.url().nullable()
});

export const mediaListResponseSchema = z.object({
  items: z.array(mediaItemSchema),
  nextCursor: z.string().nullable()
});

export const mediaListQuerySchema = z.object({
  cursor: z.string().max(400).optional(),
  kind: attachmentKindSchema.optional(),
  limit: z.coerce.number().int().min(1).max(60).optional(),
  search: z.string().max(80).optional()
});

/**
 * Referencia exacta con la que Meta resuelve una plantilla aprobada: nombre e idioma.
 *
 * No es la plantilla interna del bot (`{fecha}` en una fila de `message_templates`): esta vive en la
 * cuenta de WhatsApp Business del proveedor y no se puede enviar si no coincide exactamente.
 */
export const whatsappTemplateReferenceSchema = z.object({
  language: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(200)
});

export type WhatsappTemplateReference = z.infer<typeof whatsappTemplateReferenceSchema>;

export const conversationMessageSchema = z.object({
  attachments: z.array(messageAttachmentSchema),
  id: z.uuid(),
  body: z.string().max(8000),
  // Presente cuando el mensaje salio como plantilla de Meta: el cuerpo es su copia visible.
  whatsappTemplate: whatsappTemplateReferenceSchema.nullable(),
  // Estado del comentario en la plataforma. Solo presente en mensajes de comentario.
  commentState: z.enum(['visible', 'hidden', 'deleted']).nullish(),
  /** La respuesta privada es de un solo uso: la interfaz necesita saberlo antes de ofrecerla. */
  commentPrivateReplyAvailable: z.boolean().nullish(),
  createdAt: z.string().datetime(),
  direction: messageDirectionSchema,
  senderType: messageSenderTypeSchema,
  sentAt: z.string().datetime().nullable(),
  // Origen: mensaje directo o comentario de una publicacion.
  source: z.enum(['dm', 'comment']),
  status: messageStatusSchema
});

export const conversationMessageListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(100)
});

export const conversationMessageListResponseSchema = z.object({
  items: z.array(conversationMessageSchema),
  nextCursor: z.null()
});

/**
 * Un mensaje saliente es texto libre o plantilla de Meta, nunca los dos.
 *
 * `kind` es opcional en el texto para no romper a quien ya envia cuerpo sin declararlo; declarar
 * `kind: 'text'` sigue siendo valido. La variante de plantilla no admite cuerpo: lo que se despacha
 * es la referencia, y la copia visible la escribe el servidor a partir de la definicion aprobada.
 */
export const outboundIdempotencyKeySchema = z.uuid();

export const createOutboundTextMessageSchema = z.object({
  body: z.string().trim().min(1).max(8000),
  idempotencyKey: outboundIdempotencyKeySchema,
  kind: z.literal('text').default('text')
});

export const createOutboundWhatsappTemplateMessageSchema = z.object({
  idempotencyKey: outboundIdempotencyKeySchema,
  kind: z.literal('whatsapp_template'),
  whatsappTemplate: whatsappTemplateReferenceSchema
});

export const createOutboundMessageSchema = z.union([
  createOutboundWhatsappTemplateMessageSchema,
  createOutboundTextMessageSchema
]);

export const createOutboundMessageResponseSchema = z.object({
  item: conversationMessageSchema
});

export const updateConversationStatusSchema = z.object({
  status: conversationStatusSchema,
  statusVersion: z.number().int().min(1)
});

export const updateConversationStatusResponseSchema = z.object({
  item: conversationSummarySchema
});

export const updateConversationAssignmentSchema = z.object({
  assignedUserId: z.uuid().nullable(),
  assignmentVersion: z.number().int().min(1)
});

export const updateConversationAssignmentResponseSchema = z.object({
  item: conversationSummarySchema
});

export const updateConversationAutomationSchema = z.object({
  automationMode: z.enum(['auto', 'paused']),
  automationVersion: z.number().int().min(1)
});

export const updateConversationAutomationResponseSchema = z.object({
  item: conversationSummarySchema
});

export const markConversationReadSchema = z.object({
  upTo: z.string().datetime()
});

export const markConversationReadResponseSchema = z.object({
  item: z.object({
    conversationId: z.uuid(),
    lastReadAt: z.string().datetime().nullable()
  })
});

export const tenantMemberSchema = z.object({
  displayName: z.string().max(80).nullable(),
  email: z.string().email().nullable(),
  role: tenantRoleSchema,
  userId: z.uuid()
});

export const tenantMemberListResponseSchema = z.object({
  items: z.array(tenantMemberSchema)
});

export const ownProfileSchema = z.object({
  displayName: z.string().max(80).nullable(),
  email: z.string().max(200).nullable(),
  userId: z.uuid()
});

export const ownProfileResponseSchema = z.object({
  item: ownProfileSchema
});

export const updateOwnProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(80)
});

export const inviteTenantMemberSchema = z.object({
  email: z.email().max(200),
  role: tenantRoleSchema
});

export const inviteTenantMemberResponseSchema = z.object({
  item: z.object({
    email: z.string().min(1).max(200),
    inviteLink: z.url(),
    requiresPassword: z.boolean(),
    role: tenantRoleSchema
  })
});

export const updateTenantMemberRoleSchema = z.object({
  role: tenantRoleSchema
});

export const updateTenantMemberRoleResponseSchema = z.object({
  item: tenantMemberSchema
});

export const removeTenantMemberResponseSchema = z.object({
  item: z.object({ userId: z.uuid() })
});

export const internalLabelSchema = z.object({
  color: z.string().regex(/^#[0-9a-f]{6}$/),
  id: z.uuid(),
  name: z.string().min(1).max(64),
  updatedAt: z.string().datetime(),
  version: z.number().int().min(1)
});

export const internalLabelListResponseSchema = z.object({
  items: z.array(internalLabelSchema)
});

export const createInternalLabelSchema = z.object({
  idempotencyKey: z.uuid(),
  name: z.string().trim().min(1).max(64)
});

export const updateInternalLabelSchema = z.object({
  name: z.string().trim().min(1).max(64),
  version: z.number().int().min(1)
});

export const deleteInternalLabelSchema = z.object({
  version: z.number().int().min(1)
});

export const internalLabelMutationResponseSchema = z.object({
  item: internalLabelSchema
});

export const cannedResponseSchema = z.object({
  canManage: z.boolean(),
  id: z.uuid(),
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(8000),
  version: z.number().int().min(1),
  updatedAt: z.string().datetime()
});

export const cannedResponseListResponseSchema = z.object({
  items: z.array(cannedResponseSchema)
});

export const createCannedResponseSchema = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(8000),
  idempotencyKey: z.uuid()
});

export const updateCannedResponseSchema = z.object({
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(8000),
  version: z.number().int().min(1)
});

export const deleteCannedResponseSchema = z.object({
  version: z.number().int().min(1)
});

export const cannedResponseMutationResponseSchema = z.object({
  item: cannedResponseSchema
});

export const conversationNoteSchema = z.object({
  body: z.string().min(1).max(2000),
  createdAt: z.string().datetime(),
  createdByUserId: z.uuid().nullable(),
  id: z.uuid()
});

export const conversationNoteListResponseSchema = z.object({
  items: z.array(conversationNoteSchema)
});

export const createConversationNoteSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  idempotencyKey: z.uuid()
});

export const conversationNoteMutationResponseSchema = z.object({
  item: conversationNoteSchema
});

export const agentInvocationSchema = z.object({
  correlationId: z.uuid(),
  conversationId: z.uuid(),
  messageId: z.uuid(),
  messageText: z.string().min(1).max(8000),
  tenantId: z.uuid()
});

export const agentOutputSchema = z
  .object({
    action: z.enum(['reply', 'handoff', 'no_reply']),
    reply: z
      .object({
        text: z.string().min(1).max(5000).optional(),
        mediaAssetIds: z.array(z.uuid()).max(4).default([])
      })
      .optional(),
    labels: z
      .object({
        add: z.array(z.string().min(1).max(64)).max(10).default([]),
        remove: z.array(z.string().min(1).max(64)).max(10).default([])
      })
      .default({ add: [], remove: [] }),
    handoff: z
      .object({
        reasonCode: z.string().min(1).max(100),
        note: z.string().max(1000).optional()
      })
      .nullable()
      .default(null),
    confidence: z.number().min(0).max(1),
    reasonCode: z.string().min(1).max(100)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.action === 'reply' && !value.reply) {
      context.addIssue({ code: 'custom', message: 'reply is required when action is reply' });
    }
    if (value.action === 'handoff' && !value.handoff) {
      context.addIssue({ code: 'custom', message: 'handoff is required when action is handoff' });
    }
  });

export type ConversationStatus = z.infer<typeof conversationStatusSchema>;
export type ConversationAssignmentScope = z.infer<typeof conversationAssignmentScopeSchema>;
export type AutomationMode = z.infer<typeof automationModeSchema>;
export type MessageStatus = z.infer<typeof messageStatusSchema>;
export type TenantRole = z.infer<typeof tenantRoleSchema>;
export type AgentOutput = z.infer<typeof agentOutputSchema>;
export type AgentInvocation = z.infer<typeof agentInvocationSchema>;
export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;
export type ConversationListResponse = z.infer<typeof conversationListResponseSchema>;
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;
export type MarkConversationRead = z.infer<typeof markConversationReadSchema>;
export type MarkConversationReadResponse = z.infer<typeof markConversationReadResponseSchema>;
export type ContactAvatarResponse = z.infer<typeof contactAvatarResponseSchema>;
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;
export type AttachmentKind = z.infer<typeof attachmentKindSchema>;
export type MessageAttachment = z.infer<typeof messageAttachmentSchema>;
export type MediaItem = z.infer<typeof mediaItemSchema>;
export type MediaListQuery = z.infer<typeof mediaListQuerySchema>;
export type MediaListResponse = z.infer<typeof mediaListResponseSchema>;
export type ConversationMessageListQuery = z.infer<typeof conversationMessageListQuerySchema>;
export type ConversationMessageListResponse = z.infer<typeof conversationMessageListResponseSchema>;
export type CreateOutboundMessage = z.infer<typeof createOutboundMessageSchema>;
export type CreateOutboundMessageResponse = z.infer<typeof createOutboundMessageResponseSchema>;
export type UpdateConversationStatus = z.infer<typeof updateConversationStatusSchema>;
export type UpdateConversationStatusResponse = z.infer<
  typeof updateConversationStatusResponseSchema
>;
export type UpdateConversationAssignment = z.infer<typeof updateConversationAssignmentSchema>;
export type UpdateConversationAssignmentResponse = z.infer<
  typeof updateConversationAssignmentResponseSchema
>;
export type UpdateConversationAutomation = z.infer<typeof updateConversationAutomationSchema>;
export type UpdateConversationAutomationResponse = z.infer<
  typeof updateConversationAutomationResponseSchema
>;
export type TenantMember = z.infer<typeof tenantMemberSchema>;
export type OwnProfile = z.infer<typeof ownProfileSchema>;
export type OwnProfileResponse = z.infer<typeof ownProfileResponseSchema>;
export type UpdateOwnProfile = z.infer<typeof updateOwnProfileSchema>;
export type TenantMemberListResponse = z.infer<typeof tenantMemberListResponseSchema>;
export type InternalLabel = z.infer<typeof internalLabelSchema>;
export type InternalLabelListResponse = z.infer<typeof internalLabelListResponseSchema>;
export type CreateInternalLabel = z.infer<typeof createInternalLabelSchema>;
export type UpdateInternalLabel = z.infer<typeof updateInternalLabelSchema>;
export type DeleteInternalLabel = z.infer<typeof deleteInternalLabelSchema>;
export type InternalLabelMutationResponse = z.infer<typeof internalLabelMutationResponseSchema>;
export type CannedResponse = z.infer<typeof cannedResponseSchema>;
export type CannedResponseListResponse = z.infer<typeof cannedResponseListResponseSchema>;
export type CreateCannedResponse = z.infer<typeof createCannedResponseSchema>;
export type UpdateCannedResponse = z.infer<typeof updateCannedResponseSchema>;
export type DeleteCannedResponse = z.infer<typeof deleteCannedResponseSchema>;
export type CannedResponseMutationResponse = z.infer<typeof cannedResponseMutationResponseSchema>;
export type ConversationNote = z.infer<typeof conversationNoteSchema>;
export type ConversationNoteListResponse = z.infer<typeof conversationNoteListResponseSchema>;
export type CreateConversationNote = z.infer<typeof createConversationNoteSchema>;
export type ConversationNoteMutationResponse = z.infer<
  typeof conversationNoteMutationResponseSchema
>;
export type TenantListResponse = z.infer<typeof tenantListResponseSchema>;
export type TenantSummary = z.infer<typeof tenantSummarySchema>;
export type InviteTenantMember = z.infer<typeof inviteTenantMemberSchema>;
export type InviteTenantMemberResponse = z.infer<typeof inviteTenantMemberResponseSchema>;
export type UpdateTenantMemberRole = z.infer<typeof updateTenantMemberRoleSchema>;
export type UpdateTenantMemberRoleResponse = z.infer<typeof updateTenantMemberRoleResponseSchema>;
export type RemoveTenantMemberResponse = z.infer<typeof removeTenantMemberResponseSchema>;
export type ZernioConnectPlatform = z.infer<typeof zernioConnectPlatformSchema>;
export type ZernioChannel = z.infer<typeof zernioChannelSchema>;
export type ZernioChannelListResponse = z.infer<typeof zernioChannelListResponseSchema>;
export type StartZernioChannelConnection = z.infer<typeof startZernioChannelConnectionSchema>;
export type StartZernioChannelConnectionResponse = z.infer<
  typeof startZernioChannelConnectionResponseSchema
>;
export type RenameZernioChannel = z.infer<typeof renameZernioChannelSchema>;
export type RenameZernioChannelResponse = z.infer<typeof renameZernioChannelResponseSchema>;

// --- Tools de n8n ---------------------------------------------------------------------------
// Credencial de maquina: identifica el espacio, por eso ninguna ruta lleva tenantId.

export const toolMediaSchema = z
  .object({
    branchMediaId: z.uuid().optional(),
    kind: attachmentKindSchema.optional(),
    url: z.url().optional()
  })
  .refine((value) => Boolean(value.branchMediaId) !== Boolean(value.url), {
    message: 'Cada adjunto se indica por branchMediaId o por url, no ambos.'
  });

export const toolSendMessageSchema = z
  .object({
    conversationId: z.uuid(),
    idempotencyKey: z.string().trim().min(1).max(120).optional(),
    media: z.array(toolMediaSchema).max(10).optional(),
    templateName: z.string().trim().min(1).max(80).optional(),
    text: z.string().trim().min(1).max(4000).optional()
  })
  .refine((value) => Boolean(value.text) || Boolean(value.media?.length), {
    message: 'Un mensaje necesita texto o multimedia.'
  });

export const toolSendMessageResponseSchema = z.object({
  messageId: z.uuid(),
  providerMessageId: z.string().min(1).nullable(),
  status: messageStatusSchema
});

export const toolBranchSchema = z.object({
  id: z.uuid(),
  isActive: z.boolean(),
  name: z.string().min(1),
  slug: z.string().min(1)
});

export const toolBranchListResponseSchema = z.object({
  items: z.array(toolBranchSchema)
});

export const toolBranchMediaItemSchema = z.object({
  id: z.uuid(),
  kind: attachmentKindSchema,
  sortOrder: z.number().int(),
  title: z.string().nullable(),
  url: z.string().min(1)
});

export const toolBranchMediaResponseSchema = z.object({
  items: z.array(toolBranchMediaItemSchema)
});

export const toolAssignmentSchema = z.object({
  advisorEmail: z.email().optional(),
  advisorUserId: z.uuid().optional(),
  conversationId: z.uuid(),
  turnBotOff: z.boolean().default(true)
});

export const toolAssignmentResponseSchema = z.object({
  assignedUserId: z.uuid().nullable(),
  automationMode: automationModeSchema,
  conversationId: z.uuid()
});

export const toolConversationSchema = z.object({
  assignedUserId: z.uuid().nullable(),
  automationMode: automationModeSchema,
  branch: z.object({ name: z.string().min(1), slug: z.string().min(1) }).nullable(),
  contact: z.object({
    id: z.uuid(),
    name: z.string().min(1),
    platform: z.string().nullable(),
    username: z.string().nullable()
  }),
  id: z.uuid(),
  labels: z.array(z.string()),
  lastMessageAt: z.string().datetime().nullable(),
  status: conversationStatusSchema
});

export const toolBranchUpdateSchema = z.object({
  branchSlug: z.string().trim().min(2).max(41)
});

export const toolLabelsSchema = z.object({
  labels: z.array(z.string().trim().min(1).max(64)).min(1).max(20)
});

export type ToolAssignment = z.infer<typeof toolAssignmentSchema>;
export type ToolAssignmentResponse = z.infer<typeof toolAssignmentResponseSchema>;
export type ToolBranch = z.infer<typeof toolBranchSchema>;
export type ToolBranchListResponse = z.infer<typeof toolBranchListResponseSchema>;
export type ToolBranchMediaResponse = z.infer<typeof toolBranchMediaResponseSchema>;
export type ToolConversation = z.infer<typeof toolConversationSchema>;
export type ToolSendMessage = z.infer<typeof toolSendMessageSchema>;
export type ToolSendMessageResponse = z.infer<typeof toolSendMessageResponseSchema>;

/* ------------------------------------------------------------------------------------------------
   Acciones sobre comentarios. Ver specs/020-acciones-sobre-comentarios.md.

   El cuerpo lleva solo el texto: la clave de idempotencia la genera el servidor a partir del
   comentario y el mensaje, para que el cliente no pueda provocar publicaciones duplicadas.
   ------------------------------------------------------------------------------------------------ */

export const commentReplyBodySchema = z.object({
  message: z.string().trim().min(1).max(2200)
});

export type CommentReplyBody = z.infer<typeof commentReplyBodySchema>;

export const commentModerationResponseSchema = z.object({
  commentState: z.enum(['visible', 'hidden', 'deleted']),
  messageId: z.string().uuid()
});

export type CommentModerationResponse = z.infer<typeof commentModerationResponseSchema>;

export const commentReplyResponseSchema = commentModerationResponseSchema.extend({
  /** La respuesta privada es de un solo uso: la interfaz necesita saber si sigue disponible. */
  privateReplyAvailable: z.boolean()
});

export type CommentReplyResponse = z.infer<typeof commentReplyResponseSchema>;
/* ------------------------------------------------------------------------------------------------
   Resumen de actividad para el panel. Lectura pura: cuenta lo que ya esta guardado.
   ------------------------------------------------------------------------------------------------ */

export const metricsSummaryQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30)
});

export type MetricsSummaryQuery = z.infer<typeof metricsSummaryQuerySchema>;

export const metricsDaySchema = z.object({
  date: z.string(),
  received: z.number().int(),
  sent: z.number().int()
});

export const metricsChannelSchema = z.object({
  platform: z.string(),
  received: z.number().int(),
  sent: z.number().int()
});

/**
 * Quien atendio una conversacion cerrada.
 *
 * Se atribuye por PARTICIPACION, no por quien pulso el boton: si ningun asesor escribio, la llevo el
 * bot de principio a fin. Medir quien pulso «cerrar» diria quien ordena la lista, no quien atendio.
 */
export const metricsClosureSchema = z.object({
  byAdvisor: z.number().int(),
  byBot: z.number().int()
});

export type MetricsClosure = z.infer<typeof metricsClosureSchema>;

/** Cuando una respuesta de asesor deja de ser buena. Viaja en la respuesta para no repetirla en la interfaz. */
export const metricsResponseThresholdsSchema = z.object({
  amberSeconds: z.number().int(),
  redSeconds: z.number().int()
});

export const metricsResponseTimeSchema = z.object({
  /** Nulo cuando ningun asesor respondio en el periodo: un cero mentiria. */
  averageSeconds: z.number().int().nullable(),
  betweenFiveAndTenMinutes: z.number().int(),
  conversations: z.number().int(),
  overTenMinutes: z.number().int(),
  thresholds: metricsResponseThresholdsSchema,
  underFiveMinutes: z.number().int()
});

export type MetricsResponseTime = z.infer<typeof metricsResponseTimeSchema>;

/** Rendimiento atribuible al primer respondedor de cada interacción entrante. */
export const metricsParticipantSchema = z.object({
  averageFirstResponseSeconds: z.number().int().nullable(),
  closedConversations: z.number().int(),
  firstResponses: z.number().int(),
  kind: z.enum(['advisor', 'bot']),
  label: z.string(),
  messagesSent: z.number().int()
});

export type MetricsParticipant = z.infer<typeof metricsParticipantSchema>;

export const metricsSummarySchema = z.object({
  closedConversations: z.number().int(),
  closure: metricsClosureSchema,
  messagesByChannel: z.array(metricsChannelSchema),
  messagesPerDay: z.array(metricsDaySchema),
  participants: z.array(metricsParticipantSchema),
  periodDays: z.number().int(),
  responseTime: metricsResponseTimeSchema,
  totalMessages: z.number().int(),
  /** Verdadero cuando se alcanzo el tope de lectura: las cifras son un minimo, no el total. */
  truncated: z.boolean()
});

export type MetricsSummary = z.infer<typeof metricsSummarySchema>;
/* ------------------------------------------------------------------------------------------------
   Conversacion ganada, con el valor total del servicio. Es el hecho de negocio que alimentara el
   envio de conversiones a Meta. Ver specs/019 y plans/033.
   ------------------------------------------------------------------------------------------------ */

export const markConversationWonSchema = z.object({
  amount: z.number().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/)
});

export type MarkConversationWon = z.infer<typeof markConversationWonSchema>;

export const conversationWonResponseSchema = z.object({
  amount: z.number(),
  conversationId: z.string(),
  currency: z.string(),
  outcome: z.literal('ganado'),
  setAt: z.string()
});

export type ConversationWonResponse = z.infer<typeof conversationWonResponseSchema>;

/* ------------------------------------------------------------------------------------------------
   Plantillas de WhatsApp.
   
   Son plantillas **aprobadas por Meta**, no respuestas guardadas nuestras: viven en la cuenta de
   WhatsApp del espacio y son lo unico que Meta acepta para escribir fuera de la ventana de 24 horas.
   El nombre y el idioma son la referencia exacta con la que se envian, asi que se muestran tal cual.
   ------------------------------------------------------------------------------------------------ */

export const whatsappTemplateSchema = z.object({
  category: z.string().max(40).nullable(),
  language: z.string().max(20).nullable(),
  name: z.string().min(1).max(200),
  status: z.string().max(40).nullable(),
  // Copia visible de la definicion aprobada. Es lo que se guarda en el historial y lo que se le
  // muestra a quien confirma el envio; lo que viaja al proveedor es la referencia, no este texto.
  previewText: z.string().max(4000),
  // Huecos declarados ({{1}}, {{nombre}}...) en cualquier componente. Sin valores no se puede enviar.
  variables: z.array(z.string().max(120))
});

export type WhatsappTemplate = z.infer<typeof whatsappTemplateSchema>;

/**
 * Una plantilla del catalogo, con las cuentas del espacio que la tienen.
 *
 * `sendable` y `blockedReason` los decide el servidor: la interfaz solo los presenta, no vuelve a
 * deducir la regla de lo que se puede enviar.
 */
export const whatsappTemplateItemSchema = whatsappTemplateSchema.extend({
  channelAccountIds: z.array(z.uuid()),
  sendable: z.boolean(),
  blockedReason: z.string().max(200).nullable()
});

export type WhatsappTemplateItem = z.infer<typeof whatsappTemplateItemSchema>;

export const whatsappTemplateListResponseSchema = z.object({
  items: z.array(whatsappTemplateItemSchema)
});

export type WhatsappTemplateListResponse = z.infer<typeof whatsappTemplateListResponseSchema>;

/* ------------------------------------------------------------------------------------------------
   Aviso a n8n: el cliente pulso un boton de una plantilla aprobada.

   Es un contrato de SALIDA: lo que nuestro trabajador envia al webhook del agente. Lleva solo
   identificadores internos, el contenido del boton y la plantilla que pregunto. Nada de telefonos,
   nombres, correos ni cuerpos de conversacion: n8n consulta lo que necesite con su credencial de
   maquina. El esquema es estricto a proposito: un campo de mas —un telefono que alguien agregue por
   descuido— falla al validar en lugar de salir del sistema.
   ------------------------------------------------------------------------------------------------ */

export const WHATSAPP_BUTTON_TAP_EVENT = 'whatsapp.button_tap';

export const whatsappButtonTapNotificationSchema = z
  .object({
    buttonPayload: z.string().trim().min(1).max(200),
    contactId: z.uuid(),
    conversationId: z.uuid(),
    event: z.literal(WHATSAPP_BUTTON_TAP_EVENT),
    messageId: z.uuid(),
    occurredAt: z.string().datetime(),
    template: whatsappTemplateReferenceSchema
  })
  .strict();

export type WhatsappButtonTapNotification = z.infer<typeof whatsappButtonTapNotificationSchema>;

/* ------------------------------------------------------------------------------------------------
   Vocabulario de las reservas del proyecto SPA.

   Los estados y las acciones tienen que seguir coincidiendo con lo que esa base espera, y las
   acciones con el SQL del RPC que aplica la decision. Viven aqui, con el resto de los vocabularios
   que comparten la API y la interfaz.
   ------------------------------------------------------------------------------------------------ */

/** Acciones de decision. Deben coincidir con el SQL del RPC del proyecto de reservas. */
export const DECISION_ACTIONS = ['approved', 'rejected', 'needs_info'] as const;

export type ReservationDecisionAction = (typeof DECISION_ACTIONS)[number];

/** Estados con los que se muestra una pre-reserva, en el orden de la barra de filtros. */
export const RESERVATION_STATUSES = [
  'pending',
  'review',
  'info',
  'processing',
  'confirmed',
  'rejected'
] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/* ------------------------------------------------------------------------------------------------
   Tablero de reservas: lo que devuelve la lectura.

   Copia la forma del modelo del dominio, pero con las fechas en **texto ISO**: un `Date` no viaja
   bien en JSON, y el mapeo se hace en el servicio. Los estados que se muestran van aparte del estado
   crudo de la base: uno es lo que escribio Postgres (`estado`) y el otro lo que el equipo ve.
   ------------------------------------------------------------------------------------------------ */

export const reservationStatusSchema = z.enum(RESERVATION_STATUSES);
export const reservationDecisionActionSchema = z.enum(DECISION_ACTIONS);

export const reservationEvidenceSchema = z.record(z.string(), z.unknown());

export const reservationDraftSchema = z.object({
  actualizadaEn: z.string().nullable(),
  cerradaEn: z.string().nullable(),
  confirmada: z.boolean(),
  confirmadaEn: z.string().nullable(),
  correo: z.string().nullable(),
  creadaEn: z.string().nullable(),
  entroEn: z.string().nullable(),
  estado: z.string(),
  estadoMostrado: reservationStatusSchema,
  evidencia: reservationEvidenceSchema.nullable(),
  horarioPendiente: z.boolean(),
  horarioProgramado: z.string().nullable(),
  id: z.number().int().nullable(),
  intentosPago: z.number().int().nullable(),
  motivoRevision: z.string().nullable(),
  motivosPago: z.array(z.string()),
  monto: z.number(),
  montoEsperado: z.number(),
  nombre: z.string().nullable(),
  pagoRecibido: z.boolean(),
  procesandoDesde: z.string().nullable(),
  retencionExpiraEn: z.string().nullable(),
  revisadaEn: z.string().nullable(),
  servicio: z.string().nullable(),
  servicioCodigo: z.string().nullable(),
  telefono: z.string().nullable()
});

export const reservationConfirmedSchema = z.object({
  confirmadaEn: z.string().nullable(),
  correo: z.string().nullable(),
  horarioProgramado: z.string().nullable(),
  id: z.number().int().nullable(),
  monto: z.number(),
  nombre: z.string().nullable(),
  servicio: z.string().nullable(),
  sucursal: z.string().nullable(),
  telefono: z.string().nullable()
});

export const reservationDecisionSchema = z.object({
  accion: z.string(),
  autor: z.string().nullable(),
  borradorId: z.number().int().nullable(),
  creadaEn: z.string().nullable(),
  estadoAnterior: z.string().nullable(),
  estadoResultante: z.string().nullable(),
  id: z.number().int().nullable(),
  nota: z.string().nullable()
});

export const reservationReceiptSchema = z.object({
  actualizadoEn: z.string().nullable(),
  banco: z.string().nullable(),
  borradorId: z.number().int().nullable(),
  confianza: z.number().nullable(),
  cuenta: z.string().nullable(),
  desdeEvidencia: z.boolean(),
  estado: z.string(),
  mediaUrl: z.string().nullable(),
  metodo: z.string().nullable(),
  monto: z.number(),
  montoEsperado: z.number(),
  motivos: z.array(z.string()),
  pagadoEn: z.string().nullable(),
  recibidoEn: z.string().nullable(),
  referencia: z.string().nullable(),
  titular: z.string().nullable()
});

/** Retencion de Pabau a punto de expirar: si vence, se libera el horario y se pierde la reserva. */
export const expiringHoldSchema = z.object({
  borradorId: z.number().int().nullable(),
  expiraEn: z.string(),
  nombre: z.string().nullable()
});

export const reservationKpisSchema = z.object({
  confirmadasHoy: z.number().int(),
  enConfirmacion: z.number().int(),
  montoConfirmadoHoy: z.number(),
  montoPendiente: z.number(),
  porGestionar: z.number().int(),
  porRevisar: z.number().int(),
  pendientes: z.number().int(),
  proximas24h: z.number().int(),
  rechazadas: z.number().int(),
  retencionesPorVencer: z.array(expiringHoldSchema),
  ultimaConfirmacionEn: z.string().nullable(),
  ultimaDecisionEn: z.string().nullable(),
  comprobantesPorRevisar: z.number().int()
});

export const reservationsBoardResponseSchema = z.object({
  actualizadoEn: z.string(),
  confirmadas: z.array(reservationConfirmedSchema),
  decisiones: z.array(reservationDecisionSchema),
  kpis: reservationKpisSchema,
  preReservas: z.array(reservationDraftSchema),
  comprobantes: z.array(reservationReceiptSchema)
});

/** Comando de revisión de un comprobante. La clave evita aplicar dos veces un reintento del navegador. */
export const decideReservationSchema = z.object({
  action: z.enum(['approved', 'rejected', 'needs_info']),
  idempotencyKey: z.string().uuid(),
  note: z.string().trim().max(1000).nullable().optional()
});

export const decideReservationResponseSchema = z.object({
  item: z.object({
    action: z.string(),
    decidedByEmail: z.string().email(),
    duplicate: z.boolean(),
    previousStatus: z.string().nullable(),
    reservationDraftId: z.number().int(),
    resultingStatus: z.string()
  })
});

export type ReservationDraftView = z.infer<typeof reservationDraftSchema>;
export type ReservationConfirmedView = z.infer<typeof reservationConfirmedSchema>;
export type ReservationDecisionView = z.infer<typeof reservationDecisionSchema>;
export type ReservationReceiptView = z.infer<typeof reservationReceiptSchema>;
export type ReservationKpis = z.infer<typeof reservationKpisSchema>;
export type ReservationsBoardResponse = z.infer<typeof reservationsBoardResponseSchema>;
export type DecideReservation = z.infer<typeof decideReservationSchema>;
export type DecideReservationResponse = z.infer<typeof decideReservationResponseSchema>;
