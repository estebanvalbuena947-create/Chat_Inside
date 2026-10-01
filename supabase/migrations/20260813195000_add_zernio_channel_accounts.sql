-- Vínculo explícito entre cuentas de proveedores y tenants locales.
-- Evita que un webhook de Zernio se atribuya a un tenant por inferencia.
create table public.channel_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  provider text not null,
  provider_account_id text not null,
  platform text,
  display_name text,
  created_at timestamptz not null default now(),
  constraint channel_accounts_provider_check check (provider in ('zernio')),
  constraint channel_accounts_provider_account_key unique (provider, provider_account_id),
  constraint channel_accounts_display_name_length_check
    check (display_name is null or char_length(trim(display_name)) between 1 and 160)
);

create index channel_accounts_tenant_id_idx on public.channel_accounts (tenant_id);

alter table public.channel_accounts enable row level security;

revoke all on table public.channel_accounts from anon, authenticated;

comment on table public.channel_accounts is
  'Mapa explícito entre una cuenta de proveedor conectada y un tenant local.';
