-- Referencias externas y estado de reclamación para normalizar eventos Inbox sin duplicados.
alter table public.channel_accounts
  add constraint channel_accounts_tenant_id_id_key unique (tenant_id, id);

alter table public.conversations
  add column channel_account_id uuid,
  add column external_reference text,
  add constraint conversations_tenant_channel_account_fkey
    foreign key (tenant_id, channel_account_id)
    references public.channel_accounts (tenant_id, id) on delete restrict;

create unique index conversations_tenant_channel_external_reference_key
  on public.conversations (tenant_id, channel_account_id, external_reference)
  where channel_account_id is not null and external_reference is not null;

alter table public.messages
  add column channel_account_id uuid,
  add column provider_message_id text,
  add constraint messages_tenant_channel_account_fkey
    foreign key (tenant_id, channel_account_id)
    references public.channel_accounts (tenant_id, id) on delete restrict;

create unique index messages_tenant_channel_provider_message_key
  on public.messages (tenant_id, channel_account_id, provider_message_id)
  where channel_account_id is not null and provider_message_id is not null;

alter table public.webhook_events
  add column processing_started_at timestamptz,
  add column processing_attempts integer not null default 0,
  add constraint webhook_events_processing_attempts_check check (processing_attempts >= 0);

create index webhook_events_pending_claim_idx
  on public.webhook_events (received_at)
  where processed_at is null and failed_at is null and processing_started_at is null;
