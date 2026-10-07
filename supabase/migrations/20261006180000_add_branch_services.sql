-- Servicios y precios por sede.
--
-- Contexto: hoy los precios viven en dos sitios malos. El prompt maestro del agente (273 KB, con 66
-- importes) y seis nodos de codigo con el anticipo repetido cuatro veces. Cambiar el anticipo exige
-- editar cuatro nodos y acordarse de todos.
--
-- Con esta tabla, actualizar un precio es editar una fila. Y ademas el prompt puede adelgazar: los
-- precios se consultan bajo demanda, lo que reduce el coste y el tiempo de cada respuesta.
--
-- El precio lleva importe y moneda por separado, y una unidad: hay precios por persona (el anticipo,
-- la tribu) y precios por total (la pareja). El bot necesita distinguirlo para no decir "$1.998 por
-- persona" cuando son dos.
--
-- Aditivo e idempotente.

create table if not exists public.branch_services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  code text not null,
  name text not null,
  price numeric(12, 2) not null,
  currency text not null default 'MXN',
  price_unit text not null default 'total',
  notes text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_services_price_check check (price >= 0),
  constraint branch_services_unit_check check (price_unit in ('per_person', 'total')),
  constraint branch_services_code_check check (code ~ '^[a-z0-9_]{2,40}$')
);

comment on table public.branch_services is
  'Servicios y precios por sede. Actualizar un precio es editar una fila, no un flujo.';
comment on column public.branch_services.code is
  'Clave estable para que los flujos consulten por codigo y no por el texto visible.';
comment on column public.branch_services.price_unit is
  'per_person o total: el bot lo necesita para redactar el precio sin equivocarse.';

-- Una clave por sede, para que un flujo pueda pedir "el anticipo de valle" sin ambiguedad.
create unique index if not exists branch_services_branch_code_idx
  on public.branch_services (branch_id, code);

create index if not exists branch_services_tenant_active_idx
  on public.branch_services (tenant_id, branch_id)
  where is_active;

-- Reversion: la tabla es nueva, asi que revertir es quitarla. Ojo: destruye los precios que se
-- hayan cargado; si hay que conservarlos, exportarlos antes. Los importes siguen en el prompt
-- maestro, asi que el bot puede seguir respondiendo mientras se decide.
--
--   drop table if exists public.branch_services;
