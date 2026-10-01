-- Reintento acotado de copias de multimedia: se cuenta cada intento para no insistir sin fin
-- sobre un enlace que ya caduco.

alter table public.message_attachments
  add column download_attempts integer not null default 0;

alter table public.message_attachments
  add constraint message_attachments_download_attempts_check
    check (download_attempts between 0 and 100);

comment on column public.message_attachments.download_attempts is
  'Intentos de copia realizados. Un enlace caducado no puede reintentarse indefinidamente.';

create index message_attachments_retry_idx
  on public.message_attachments (download_attempts, download_failed_at)
  where storage_object_path is null;
