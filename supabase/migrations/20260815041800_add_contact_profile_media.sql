-- Datos de perfil recibidos exclusivamente mediante webhooks firmados de Zernio.
alter table public.contacts
  add column external_username text,
  add column avatar_object_path text,
  add column avatar_source_hash text;

alter table public.contacts
  add constraint contacts_external_username_length_check
    check (external_username is null or char_length(trim(external_username)) between 1 and 160),
  add constraint contacts_avatar_object_path_length_check
    check (avatar_object_path is null or char_length(avatar_object_path) between 1 and 512),
  add constraint contacts_avatar_source_hash_length_check
    check (avatar_source_hash is null or char_length(avatar_source_hash) = 64);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contact-avatars',
  'contact-avatars',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

comment on column public.contacts.external_username is
  'Nombre de usuario externo confirmado por un webhook firmado.';
comment on column public.contacts.avatar_object_path is
  'Ruta del avatar en el bucket privado contact-avatars.';
