create table public.google_review_integrations (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  webhook_url text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_review_integrations_url_check check (webhook_url ~ '^https://[^[:space:]]+$')
);
alter table public.google_review_integrations enable row level security;
create policy "admins manage tenant review integration" on public.google_review_integrations using (exists (select 1 from public.memberships m where m.tenant_id = google_review_integrations.tenant_id and m.user_id = auth.uid() and m.role = 'admin'));
