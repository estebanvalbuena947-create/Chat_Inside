-- La rotacion reparte SOLO entre quien atiende: las membresias con rol 'agent'.
--
-- Un administrador o un supervisor puede tener la bandeja abierta --y su pulso se registra igual--,
-- pero no entra en el reparto: su papel no es atender conversaciones. Antes participaba cualquiera
-- con presencia, y eso ponia al administrador en la cola de transferencias.
--
-- Para sumar otro rol al reparto basta anadir su nombre a `v_roles` aqui abajo: la regla vive en un
-- solo sitio. Si el negocio prefiere que un supervisor tambien atienda, se anade 'supervisor' y no hay
-- que tocar ni la API ni los flujos.
--
-- Es idempotente (`create or replace`) y sustituye a la version de 20261009140000, que ya esta
-- aplicada en el proyecto remoto: por eso el cambio va en su propia migracion y no editando aquella.

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

  if v_next_user_id is not null then
    update public.advisor_assignment_cursors
    set last_user_id = v_next_user_id, updated_at = now()
    where tenant_id = p_tenant_id;
  end if;

  return v_next_user_id;
end;
$$;

-- Los permisos se repiten porque `create or replace` conserva los de la version anterior, pero
-- dejarlos escritos evita que una recreacion futura abra la puerta sin que nadie lo note.
revoke all on function public.claim_next_active_advisor(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_next_active_advisor(uuid, timestamptz) to service_role;

-- Reversion: volver a ejecutar la version de 20261009140000_add_advisor_presence_rotation.sql
-- (sin el filtro de rol). Los turnos ya repartidos no se deshacen.
