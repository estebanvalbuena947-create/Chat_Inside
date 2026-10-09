-- La presencia representa una bandeja visible recientemente, no una sesión de autenticación.
create table public.advisor_presence (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null,
  last_seen_at timestamptz not null default now(),
  primary key (tenant_id, user_id),
  constraint advisor_presence_membership_fkey foreign key (tenant_id, user_id)
    references public.memberships(tenant_id, user_id) on delete cascade
);

create index advisor_presence_tenant_last_seen_idx
  on public.advisor_presence(tenant_id, last_seen_at desc);

create table public.advisor_assignment_cursors (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  last_user_id uuid,
  updated_at timestamptz not null default now()
);

alter table public.advisor_presence enable row level security;
alter table public.advisor_assignment_cursors enable row level security;

-- Solo el backend con service_role invoca esta función. El bloqueo de la fila cursor hace la
-- selección round-robin una operación atómica incluso si llegan varias transferencias a la vez.
create or replace function public.claim_next_active_advisor(
  p_tenant_id uuid,
  p_active_after timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last_user_id uuid;
  v_next_user_id uuid;
begin
  insert into public.advisor_assignment_cursors (tenant_id)
  values (p_tenant_id)
  on conflict (tenant_id) do nothing;

  select last_user_id into v_last_user_id
  from public.advisor_assignment_cursors
  where tenant_id = p_tenant_id
  for update;

  select m.user_id into v_next_user_id
  from public.memberships m
  join public.advisor_presence p
    on p.tenant_id = m.tenant_id and p.user_id = m.user_id
  where m.tenant_id = p_tenant_id
    and p.last_seen_at >= p_active_after
    and (v_last_user_id is null or m.user_id > v_last_user_id)
  order by m.user_id
  limit 1;

  if v_next_user_id is null then
    select m.user_id into v_next_user_id
    from public.memberships m
    join public.advisor_presence p
      on p.tenant_id = m.tenant_id and p.user_id = m.user_id
    where m.tenant_id = p_tenant_id
      and p.last_seen_at >= p_active_after
    order by m.user_id
    limit 1;
  end if;

  if v_next_user_id is not null then
    update public.advisor_assignment_cursors
    set last_user_id = v_next_user_id, updated_at = now()
    where tenant_id = p_tenant_id;
  end if;

  return v_next_user_id;
end;
$$;

-- Quien invoca esta funcion es el backend con la clave de servicio. Se revoca de `public` Y de los
-- roles que Supabase concede por defecto al crear una funcion (`anon` y `authenticated`): un revoke
-- a `public` no retira esas concesiones explicitas, y al ser `security definer` la funcion seria la
-- via para saltarse la RLS de las dos tablas y para escribir el cursor de otro espacio.
revoke all on function public.claim_next_active_advisor(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_next_active_advisor(uuid, timestamptz) to service_role;
