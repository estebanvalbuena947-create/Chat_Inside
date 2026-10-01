import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { RequestAuthenticator } from './auth/request-authenticator';
import { ConversationsController } from './conversations/conversations.controller';
import { ContactProfileService } from './conversations/contact-profile.service';
import { ContactProfilesController } from './conversations/contact-profiles.controller';
import { ConversationMediaController } from './conversations/conversation-media.controller';
import { ConversationMediaService } from './conversations/conversation-media.service';
import { ConversationNotesController } from './conversations/conversation-notes.controller';
import { ConversationNoteService } from './conversations/conversation-note.service';
import { TenantConversationService } from './conversations/tenant-conversation.service';
import { TenantMessageService } from './conversations/tenant-message.service';
import { SupabaseServerClientFactory } from './infrastructure/supabase-server-client.factory';
import { CannedResponsesController } from './organization/canned-responses.controller';
import { CannedResponseService } from './organization/canned-response.service';
import { InternalLabelsController } from './organization/internal-labels.controller';
import { InternalLabelService } from './organization/internal-label.service';
import { RealtimeEventsController } from './realtime/realtime-events.controller';
import { TenantRealtimeService } from './realtime/tenant-realtime.service';
import { MeController } from './tenants/me.controller';
import { TenantAccessService } from './tenants/tenant-access.service';
import { TenantsController } from './tenants/tenants.controller';
import { ZernioWebhookController } from './zernio/zernio-webhook.controller';
import { ZernioWebhookService } from './zernio/zernio-webhook.service';
import { ZernioApiClient } from './zernio/zernio-api.client';
import { ZernioChannelService } from './zernio/zernio-channel.service';
import { ZernioChannelsController } from './zernio/zernio-channels.controller';

@Module({
  controllers: [
    AppController,
    CannedResponsesController,
    InternalLabelsController,
    ConversationsController,
    ContactProfilesController,
    ConversationMediaController,
    ConversationNotesController,
    MeController,
    RealtimeEventsController,
    TenantsController,
    ZernioWebhookController,
    ZernioChannelsController
  ],
  providers: [
    SupabaseServerClientFactory,
    RequestAuthenticator,
    TenantAccessService,
    TenantConversationService,
    ContactProfileService,
    ConversationMediaService,
    ConversationNoteService,
    TenantMessageService,
    CannedResponseService,
    InternalLabelService,
    TenantRealtimeService,
    ZernioWebhookService,
    ZernioApiClient,
    ZernioChannelService
  ]
})
export class AppModule {}
