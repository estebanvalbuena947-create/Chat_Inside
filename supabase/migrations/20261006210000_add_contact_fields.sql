-- Campos por contacto.
--
-- Contexto: al revisar los 60 nodos migrados encontre que parte de los que el LEEME mapeo como
-- "envio" en realidad ESCRIBEN CAMPOS del contacto. En ManyChat eso es un almacen clave-valor por
-- suscriptor, y los flujos lo usan para llevar datos entre pasos: el monto pagado, la parte de un
-- pago dividido, el estado de un tramite.
--
-- Sin ese almacen, esos nodos no tienen a donde escribir y la migracion se queda a medias. Aqui no
-- hay suscriptores: hay contactos de nuestra base.
--
-- El valor es texto a proposito: conviven numeros (un monto) y textos (una parte de pago), y quien
-- consume el campo sabe que espera. Guardarlo como texto evita inventar un tipo por cada uso.
--
-- Aditivo e idempotente.

create table if not exists public.contact_fields (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  field_name text not null,
  field_value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contact_fields_name_check check (field_name ~ '^[a-zA-Z0-9_ ]{1,60}$')
);

comment on table public.contact_fields is
  'Almacen clave-valor por contacto. Reemplaza los campos personalizados de ManyChat.';

-- Un contacto tiene un valor por campo, no varios: escribir dos veces actualiza, no duplica.
create unique index if not exists contact_fields_contact_name_idx
  on public.contact_fields (contact_id, lower(field_name));

create index if not exists contact_fields_tenant_idx
  on public.contact_fields (tenant_id, contact_id);

-- Reversion: la tabla es nueva y solo la escriben los flujos migrados, que aun no estan activos.
-- Revertir es quitarla y no se pierde nada que exista hoy en produccion.
--
--   drop table if exists public.contact_fields;
