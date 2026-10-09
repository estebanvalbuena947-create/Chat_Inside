create table public.google_business_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  zernio_account_id text not null,
  provider_review_id text not null,
  rating integer not null check (rating between 1 and 5),
  body text,
  reviewer_name text,
  replied_at timestamptz,
  review_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider_review_id)
);
create index google_business_reviews_tenant_updated_idx on public.google_business_reviews(tenant_id, review_updated_at desc);
alter table public.google_business_reviews enable row level security;
create policy "members read tenant google reviews" on public.google_business_reviews for select using (exists (select 1 from public.memberships m where m.tenant_id = google_business_reviews.tenant_id and m.user_id = auth.uid()));
