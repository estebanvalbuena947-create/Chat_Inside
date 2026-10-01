-- Perfil Zernio explícito por tenant para iniciar OAuth sin copiar accountId.
alter table public.tenants
  add column zernio_profile_id text;

create unique index tenants_zernio_profile_id_key
  on public.tenants (zernio_profile_id)
  where zernio_profile_id is not null;

comment on column public.tenants.zernio_profile_id is
  'Perfil Zernio asociado al tenant para conectar cuentas mediante OAuth.';
