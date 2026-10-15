-- Auditoría inmutable de quién ejecutó un cierre. La transición y el evento ocurren en la misma
-- transacción: no se acepta una conversación resuelta sin actor ni un evento sin su cierre.

alter table public.conversations
  add column if not exists closure_actor_type text,
  add column if not exists closure_actor_user_id uuid;

alter table public.conversations drop constraint if exists conversations_closure_actor_type_check;
alter table public.conversations add constraint conversations_closure_actor_type_check
  check (closure_actor_type is null or closure_actor_type in ('bot', 'advisor'));

-- No se impone una restricción sobre filas históricas ya resueltas: no existe evidencia fiable de
-- su actor. El trigger sí rechaza cualquier transición nueva a resolved que no lo tenga.

create table if not exists public.conversation_closures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  conversation_id uuid not null,
  closed_at timestamptz not null,
  closed_by_type text not null,
  closed_by_user_id uuid,
  created_at timestamptz not null default now(),
  constraint conversation_closures_tenant_conversation_fkey
    foreign key (tenant_id, conversation_id) references public.conversations (tenant_id, id) on delete cascade,
  constraint conversation_closures_actor_type_check check (closed_by_type in ('bot', 'advisor')),
  constraint conversation_closures_actor_check check (
    (closed_by_type = 'bot' and closed_by_user_id is null)
    or (closed_by_type = 'advisor' and closed_by_user_id is not null)
  ),
  constraint conversation_closures_unique_transition unique (tenant_id, conversation_id, closed_at)
);

create index if not exists conversation_closures_tenant_closed_at_idx
  on public.conversation_closures (tenant_id, closed_at desc);

alter table public.conversation_closures enable row level security;
revoke all on table public.conversation_closures from anon, authenticated;

create or replace function public.audit_conversation_closure() returns trigger
language plpgsql
as $$
begin
  if new.status = 'resolved' and old.status <> 'resolved' then
    if new.resolved_at is null or new.closure_actor_type is null
      or (new.closure_actor_type = 'advisor' and new.closure_actor_user_id is null) then
      raise exception 'A resolved conversation requires a closure actor and timestamp';
    end if;
    insert into public.conversation_closures (
      tenant_id, conversation_id, closed_at, closed_by_type, closed_by_user_id
    ) values (
      new.tenant_id, new.id, new.resolved_at, new.closure_actor_type, new.closure_actor_user_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists conversations_audit_closure on public.conversations;
create trigger conversations_audit_closure
  after update of status on public.conversations
  for each row execute function public.audit_conversation_closure();

comment on table public.conversation_closures is
  'Auditoría inmutable de cada transición real a resolved y su actor ejecutor.';
