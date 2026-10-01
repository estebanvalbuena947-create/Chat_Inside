-- Multimedia de las conversaciones: se copia al almacenamiento propio porque las URLs del
-- proveedor son enlaces firmados que caducan en dias; se conserva el enlace original solo
-- como referencia.

create table public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null,
  message_id uuid not null,
  ordinal integer not null default 0,
  kind text not null,
  source_url text,
  storage_object_path text,
  content_type text,
  byte_size integer,
  created_at timestamptz not null default now(),
  downloaded_at timestamptz,
  download_failed_at timestamptz,
  constraint message_attachments_tenant_conversation_fkey
    foreign key (tenant_id, conversation_id) references public.conversations (tenant_id, id) on delete cascade,
  constraint message_attachments_tenant_message_fkey
    foreign key (tenant_id, message_id) references public.messages (tenant_id, id) on delete cascade,
  constraint message_attachments_kind_check
    check (kind in ('image', 'video', 'audio', 'file', 'share')),
  constraint message_attachments_ordinal_check check (ordinal >= 0),
  constraint message_attachments_source_url_length_check
    check (source_url is null or char_length(source_url) between 1 and 2048),
  constraint message_attachments_storage_object_path_length_check
    check (storage_object_path is null or char_length(storage_object_path) between 1 and 512),
  constraint message_attachments_content_type_length_check
    check (content_type is null or char_length(content_type) between 1 and 128),
  constraint message_attachments_byte_size_check
    check (byte_size is null or byte_size between 1 and 26214400),
  constraint message_attachments_tenant_message_ordinal_key unique (tenant_id, message_id, ordinal),
  constraint message_attachments_tenant_id_id_key unique (tenant_id, id)
);

create index message_attachments_tenant_created_at_idx
  on public.message_attachments (tenant_id, created_at desc);

create index message_attachments_tenant_conversation_idx
  on public.message_attachments (tenant_id, conversation_id, created_at desc);

create index message_attachments_pending_download_idx
  on public.message_attachments (created_at)
  where storage_object_path is null and download_failed_at is null;

alter table public.message_attachments enable row level security;

revoke all on table public.message_attachments from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'conversation-media',
  'conversation-media',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/mpeg',
    'audio/ogg'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

comment on table public.message_attachments is
  'Multimedia recibida en las conversaciones, copiada al bucket privado conversation-media.';
comment on column public.message_attachments.source_url is
  'Enlace original del proveedor. Es firmado y temporal: solo sirve como referencia.';
comment on column public.message_attachments.storage_object_path is
  'Copia durable en el bucket privado. Vacio mientras no se haya podido descargar.';
comment on column public.message_attachments.download_failed_at is
  'Marca de una descarga fallida. El mensaje se conserva aunque su multimedia no se pueda copiar.';
