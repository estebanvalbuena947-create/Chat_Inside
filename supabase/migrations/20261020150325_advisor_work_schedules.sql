create table public.advisor_work_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null,
  effective_at timestamptz not null default clock_timestamp(),
  created_by uuid,
  shifts jsonb not null check (jsonb_typeof(shifts) = 'array' and jsonb_array_length(shifts) <= 28),
  unique (tenant_id, user_id, effective_at)
);
create index advisor_work_schedules_history_idx on public.advisor_work_schedules(tenant_id,user_id,effective_at desc);
alter table public.advisor_work_schedules enable row level security;
revoke all on public.advisor_work_schedules from public, anon, authenticated;
grant select, insert on public.advisor_work_schedules to service_role;

-- The BFF never receives database privileges. The API authenticates; this RPC rechecks its actor.
create function public.save_advisor_work_schedule(p_tenant_id uuid,p_user_id uuid,p_actor_id uuid,p_expected_id uuid,p_shifts jsonb)
returns public.advisor_work_schedules language plpgsql security invoker set search_path = '' as $$
declare
  latest public.advisor_work_schedules;
  saved public.advisor_work_schedules;
  n integer;
  distinct_n integer;
begin
  -- Serializes role changes, membership removal and simultaneous schedule saves.
  perform 1 from public.memberships where tenant_id=p_tenant_id order by user_id for update;
  if not exists(select 1 from public.memberships where tenant_id=p_tenant_id and user_id=p_actor_id and role='admin') then
    raise exception 'schedule_forbidden' using errcode='42501';
  end if;
  if not exists(select 1 from public.memberships where tenant_id=p_tenant_id and user_id=p_user_id) then
    raise exception 'schedule_member_missing' using errcode='23503';
  end if;
  select * into latest from public.advisor_work_schedules where tenant_id=p_tenant_id and user_id=p_user_id order by effective_at desc limit 1;
  -- A repeated save with the same expected version and content is idempotent.
  if latest.id is distinct from p_expected_id then
    if latest.shifts=p_shifts and latest.created_by=p_actor_id then return latest; end if;
    raise exception 'schedule_conflict' using errcode='40001';
  end if;
  if jsonb_typeof(p_shifts) is distinct from 'array' or jsonb_array_length(p_shifts)>28 then
    raise exception 'schedule_invalid' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_shifts) as s(day numeric,start numeric,"end" numeric)
    where day is null or start is null or "end" is null or day<>trunc(day) or start<>trunc(start) or "end"<>trunc("end")
    or day<0 or day>6 or start<0 or start>=1440 or "end"<0 or "end">1440 or start="end") then
    raise exception 'schedule_invalid' using errcode='22023';
  end if;
  select count(*),count(distinct ((s.day*1440+s.start+minute)%10080)) into n,distinct_n
  from jsonb_to_recordset(p_shifts) as s(day integer,start integer,"end" integer),
  lateral generate_series(0,(case when s."end">s.start then s."end"-s.start else 1440-s.start+s."end" end)-1) minute;
  if n<>distinct_n then raise exception 'schedule_overlap' using errcode='22023'; end if;
  insert into public.advisor_work_schedules(tenant_id,user_id,created_by,shifts) values(p_tenant_id,p_user_id,p_actor_id,p_shifts) returning * into saved;
  return saved;
end $$;
revoke all on function public.save_advisor_work_schedule(uuid,uuid,uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.save_advisor_work_schedule(uuid,uuid,uuid,uuid,jsonb) to service_role;

-- A removed membership stops providing future coverage without erasing its history.
create function public.stop_removed_member_schedule() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if exists(select 1 from public.tenants where id=old.tenant_id) and exists(select 1 from public.advisor_work_schedules where tenant_id=old.tenant_id and user_id=old.user_id) then
    insert into public.advisor_work_schedules(tenant_id,user_id,created_by,shifts) values(old.tenant_id,old.user_id,null,'[]'::jsonb);
  end if;
  return old;
end $$;
revoke all on function public.stop_removed_member_schedule() from public,anon,authenticated;
grant execute on function public.stop_removed_member_schedule() to service_role;
create trigger membership_stop_work_schedule after delete on public.memberships for each row execute function public.stop_removed_member_schedule();

-- Raw predecessor events, not a second implementation of the response-time rule.
-- This keeps weekends eligible without reading all historical outbound messages.
create function public.metrics_prior_inbounds(p_tenant_id uuid,p_before timestamptz,p_until timestamptz)
returns table(conversation_id uuid,created_at timestamptz,direction text,sender_type text,sender_user_id uuid)
language sql stable security invoker set search_path='' as $$
  select distinct on (m.conversation_id) m.conversation_id,m.created_at,m.direction::text,m.sender_type::text,m.sender_user_id
  from public.messages m
  where m.tenant_id=p_tenant_id and m.direction='inbound' and m.created_at<p_before
    and exists(select 1 from public.messages r where r.tenant_id=p_tenant_id and r.conversation_id=m.conversation_id
      and r.direction='outbound' and r.sender_type in ('agent','automation') and r.created_at>=p_before and r.created_at<p_until)
  order by m.conversation_id,m.created_at desc,m.id desc;
$$;
revoke all on function public.metrics_prior_inbounds(uuid,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.metrics_prior_inbounds(uuid,timestamptz,timestamptz) to service_role;
