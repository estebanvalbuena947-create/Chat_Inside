-- Supabase upsert needs a non-partial unique constraint to identify a contact
-- from its provider-scoped external reference. PostgreSQL permits multiple NULLs.
drop index if exists public.contacts_tenant_external_reference_key;

alter table public.contacts
  add constraint contacts_tenant_external_reference_key
  unique (tenant_id, external_reference);
