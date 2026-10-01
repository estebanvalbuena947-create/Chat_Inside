create index canned_responses_tenant_creator_idx
  on public.canned_responses (tenant_id, created_by_user_id);
