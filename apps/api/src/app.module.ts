import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { RequestAuthenticator } from './auth/request-authenticator';
import { ConversationsController } from './conversations/conversations.controller';
import { ContactProfileService } from './conversations/contact-profile.service';
import { ContactProfilesController } from './conversations/contact-profiles.controller';
import { ConversationMediaController } from './conversations/conversation-media.controller';
import { ConversationMediaService } from './conversations/conversation-media.service';
import { CommentModerationController } from './conversations/comment-moderation.controller';
import { ConversationNotesController } from './conversations/conversation-notes.controller';
import { CommentModerationService } from './conversations/comment-moderation.service';
import { ConversationNoteService } from './conversations/conversation-note.service';
import { TenantConversationService } from './conversations/tenant-conversation.service';
import { TenantMessageService } from './conversations/tenant-message.service';
import { ConversionService } from './conversions/conversion.service';
import { SupabaseServerClientFactory } from './infrastructure/supabase-server-client.factory';
import { MetricsController } from './metrics/metrics.controller';
import { MetricsService } from './metrics/metrics.service';
import { CannedResponsesController } from './organization/canned-responses.controller';
import { CannedResponseService } from './organization/canned-response.service';
import { InternalLabelsController } from './organization/internal-labels.controller';
import { InternalLabelService } from './organization/internal-label.service';
import { RealtimeEventsController } from './realtime/realtime-events.controller';
import { TenantRealtimeService } from './realtime/tenant-realtime.service';
import { MeController } from './tenants/me.controller';
import { AdvisorPresenceController } from './tenants/advisor-presence.controller';
import { AdvisorPresenceService } from './tenants/advisor-presence.service';
import { TenantAccessService } from './tenants/tenant-access.service';
import { ToolAssignmentsController } from './tools/tool-assignments.controller';
import { ToolMessagesController } from './tools/tool-messages.controller';
import { ToolMessagesService } from './tools/tool-messages.service';
import { ToolAssignmentsService } from './tools/tool-assignments.service';
import { ToolBranchesController } from './tools/tool-branches.controller';
import { ToolBranchesService } from './tools/tool-branches.service';
import { ToolContactFieldsController } from './tools/tool-contact-fields.controller';
import { ToolContactFieldsService } from './tools/tool-contact-fields.service';
import { ToolConversionsController } from './tools/tool-conversions.controller';
import { ToolConversionsService } from './tools/tool-conversions.service';
import { ToolConversationService } from './tools/tool-conversation.service';
import { ToolTokenService } from './tools/tool-token.service';
import { ToolConversationsController } from './tools/tool-conversations.controller';
import { BranchController } from './branches/branch.controller';
import { BranchService } from './branches/branch.service';
import { BranchMediaController } from './branches/branch-media.controller';
import { BranchMediaService } from './branches/branch-media.service';
import { ToolTemplatesController } from './tools/tool-templates.controller';
import { ToolTemplatesService } from './tools/tool-templates.service';
import { TenantsController } from './tenants/tenants.controller';
import { ZernioWebhookController } from './zernio/zernio-webhook.controller';
import { ZernioWebhookService } from './zernio/zernio-webhook.service';
import { ZernioApiClient } from './zernio/zernio-api.client';
import { ZernioChannelService } from './zernio/zernio-channel.service';
import { ZernioChannelsController } from './zernio/zernio-channels.controller';
import { WhatsappTemplateCatalog } from './zernio/whatsapp-template-catalog';
import { ReservationsController } from './reservations/reservations.controller';
import { ReservationsService } from './reservations/reservations.service';

@Module({
  controllers: [
    AppController,
    CannedResponsesController,
    InternalLabelsController,
    ConversationsController,
    ContactProfilesController,
    ConversationMediaController,
    CommentModerationController,
    ConversationNotesController,
    ToolAssignmentsController,
    ToolMessagesController,
    ToolBranchesController,
    ToolContactFieldsController,
    ToolConversionsController,
    ToolConversationsController,
    ToolTemplatesController,
    BranchMediaController,
    BranchController,
    MetricsController,
    ReservationsController,
    MeController,
    AdvisorPresenceController,
    RealtimeEventsController,
    TenantsController,
    ZernioWebhookController,
    ZernioChannelsController
  ],
  providers: [
    SupabaseServerClientFactory,
    RequestAuthenticator,
    TenantAccessService,
    AdvisorPresenceService,
    TenantConversationService,
    ContactProfileService,
    ConversationMediaService,
    CommentModerationService,
    ConversationNoteService,
    ToolAssignmentsService,
    ToolBranchesService,
    ToolContactFieldsService,
    ToolConversionsService,
    ConversionService,
    ToolMessagesService,
    ToolConversationService,
    ToolTemplatesService,
    BranchMediaService,
    BranchService,
    ToolTokenService,
    MetricsService,
    ReservationsService,
    TenantMessageService,
    CannedResponseService,
    InternalLabelService,
    TenantRealtimeService,
    ZernioWebhookService,
    ZernioApiClient,
    ZernioChannelService,
    WhatsappTemplateCatalog
  ]
})
export class AppModule {}
