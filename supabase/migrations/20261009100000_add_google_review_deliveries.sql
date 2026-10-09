create table public.google_review_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  review_id uuid not null references public.google_business_reviews(id) on delete cascade,
  idempotency_key uuid not null default gen_random_uuid(),
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_id),
  unique (tenant_id, idempotency_key),
  constraint google_review_deliveries_status_check check (status in ('pending', 'sent', 'failed', 'transferred')),
  constraint google_review_deliveries_attempts_check check (attempts >= 0)
);
create index google_review_deliveries_pending_idx on public.google_review_deliveries(status, created_at) where status = 'pending';
alter table public.google_review_deliveries enable row level security;
create policy "members read tenant review deliveries" on public.google_review_deliveries for select using (exists (select 1 from public.memberships m where m.tenant_id = google_review_deliveries.tenant_id and m.user_id = auth.uid()));
