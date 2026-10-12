-- Si nadie tiene la bandeja abierta, la transferencia ya no se queda sin dueno: se entrega al
-- siguiente agente del turno y la conversacion espera a que abra la bandeja.
--
-- El orden sigue siendo el mismo: PRIMERO quien tiene presencia --esta mirando la bandeja en este
-- momento--, y solo si no hay nadie se cae al respaldo entre todos los agentes del espacio. El turno
-- se conserva, asi que el respaldo no descarga todo en la misma persona.
--
-- Sigue sin participar quien no atiende (administradores y supervisores): el respaldo cambia la
-- disponibilidad, no el papel. Si el espacio no tiene ninguna membresia con rol de agente, entonces
-- si no hay a quien entregarla y la API responde 422.
--
-- Es idempotente (`create or replace`) y va en su propia migracion porque la funcion ya esta aplicada
-- en el proyecto remoto.

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
  v_roles text[] := array['agent'];
begin
  insert into public.advisor_assignment_cursors (tenant_id)
  values (p_tenant_id)
  on conflict (tenant_id) do nothing;

  select last_user_id into v_last_user_id
  from public.advisor_assignment_cursors
  where tenant_id = p_tenant_id
  for update;

  -- 1) Con la bandeja abierta: el siguiente del turno entre quien tiene presencia.
  select m.user_id into v_next_user_id
  from public.memberships m
  join public.advisor_presence p
    on p.tenant_id = m.tenant_id and p.user_id = m.user_id
  where m.tenant_id = p_tenant_id
    and m.role = any(v_roles)
    and p.last_seen_at >= p_active_after
    and (v_last_user_id is null or m.user_id > v_last_user_id)
  order by m.user_id
  limit 1;

  -- 2) El turno da la vuelta entre quien tiene presencia.
  if v_next_user_id is null then
    select m.user_id into v_next_user_id
    from public.memberships m
    join public.advisor_presence p
      on p.tenant_id = m.tenant_id and p.user_id = m.user_id
    where m.tenant_id = p_tenant_id
      and m.role = any(v_roles)
      and p.last_seen_at >= p_active_after
    order by m.user_id
    limit 1;
  end if;

  -- 3) Respaldo: no hay nadie mirando la bandeja. Se entrega al siguiente agente del turno para que
  --    la conversacion tenga dueno y le espere; sin esto quedaria sin asignar y sin respuesta.
  if v_next_user_id is null then
    select m.user_id into v_next_user_id
    from public.memberships m
    where m.tenant_id = p_tenant_id
      and m.role = any(v_roles)
      and (v_last_user_id is null or m.user_id > v_last_user_id)
    order by m.user_id
    limit 1;
  end if;

  -- 4) Y si el turno ya paso por todos, se vuelve a empezar por el primero.
  if v_next_user_id is null then
    select m.user_id into v_next_user_id
    from public.memberships m
    where m.tenant_id = p_tenant_id
      and m.role = any(v_roles)
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

revoke all on function public.claim_next_active_advisor(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_next_active_advisor(uuid, timestamptz) to service_role;

-- Reversion: volver a ejecutar 20261009160000_rotation_only_agents.sql, que exige presencia.
