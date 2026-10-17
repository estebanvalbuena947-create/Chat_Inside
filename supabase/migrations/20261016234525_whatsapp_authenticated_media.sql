-- WhatsApp media URLs from Zernio are authenticated API endpoints, not public CDN URLs.
-- Preserve provider identifiers separately so retries can construct the authorized request without
-- persisting credentials or reparsing a URL supplied by the provider.
alter table public.message_attachments
  add column source_account_id text,
  add column source_media_id text;

alter table public.message_attachments
  add constraint message_attachments_source_account_id_length_check
    check (source_account_id is null or char_length(source_account_id) between 1 and 300),
  add constraint message_attachments_source_media_id_length_check
    check (source_media_id is null or char_length(source_media_id) between 1 and 300);

comment on column public.message_attachments.source_account_id is
  'Cuenta de Zernio necesaria para descargar multimedia privada de WhatsApp.';
comment on column public.message_attachments.source_media_id is
  'Identificador de multimedia del proveedor, sin credenciales ni URL firmada.';

-- Repair pending WhatsApp attachments that arrived before the authenticated downloader.
update public.message_attachments as attachment
set source_media_id = substring(attachment.source_url from '^https://zernio\.com/api/v1/whatsapp/media/([^?/#]+)')
where attachment.storage_object_path is null
  and attachment.source_media_id is null
  and attachment.source_url ~ '^https://zernio\.com/api/v1/whatsapp/media/[^?/#]+';

update public.message_attachments as attachment
set source_account_id = channel.provider_account_id
from public.conversations as conversation
join public.channel_accounts as channel on channel.id = conversation.channel_account_id
where attachment.conversation_id = conversation.id
  and attachment.storage_object_path is null
  and attachment.source_media_id is not null
  and attachment.source_account_id is null
  and channel.platform = 'whatsapp';

-- These failed only because the old downloader omitted Zernio authorization. The normal bounded
-- repair pass may retry them; it still stops after five failures or source expiry.
update public.message_attachments
set download_attempts = 0,
    download_failed_at = null
where storage_object_path is null
  and source_account_id is not null
  and source_media_id is not null;
