-- Telefono y correo del contacto, preparados para cuando exista la fuente del dato.
--
--   telefono: lo entrega WhatsApp al escribir (Instagram no lo da). Se guarda en formato
--             internacional E.164, que es el unico que no depende del pais de quien lee.
--   correo:   Meta no lo entrega nunca. Llegara desde el flujo de reservas (Pabau / n8n).
--
-- Los contactos existentes quedan con nulo: no se inventa ningun dato. Aditivo e idempotente.

alter table public.contacts
  add column if not exists phone_e164 text,
  add column if not exists email text;

comment on column public.contacts.phone_e164 is
  'Telefono en formato internacional E.164 (por ejemplo +5215512345678).';
comment on column public.contacts.email is
  'Correo en minusculas, para poder comparar y buscar sin depender de mayusculas.';

alter table public.contacts drop constraint if exists contacts_phone_e164_check;
alter table public.contacts add constraint contacts_phone_e164_check
  check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$');

alter table public.contacts drop constraint if exists contacts_email_check;
alter table public.contacts add constraint contacts_email_check
  check (email is null or (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));

-- Indices de trigramas: la busqueda es por coincidencia parcial, igual que el nombre.
create index if not exists contacts_phone_e164_trgm_idx
  on public.contacts using gin (phone_e164 gin_trgm_ops);

create index if not exists contacts_email_trgm_idx
  on public.contacts using gin (email gin_trgm_ops);