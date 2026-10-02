-- Busqueda de contactos por nombre o usuario: sin indices, cada tecla recorre toda la tabla.
--
-- La API busca con coincidencia parcial (contiene), asi que hacen falta indices de trigramas:
-- un btree normal no sirve para '%texto%'. Es idempotente y solo anade indices.

create extension if not exists pg_trgm;

create index if not exists contacts_display_name_trgm_idx
  on public.contacts using gin (display_name gin_trgm_ops);

create index if not exists contacts_external_username_trgm_idx
  on public.contacts using gin (external_username gin_trgm_ops);

comment on index public.contacts_display_name_trgm_idx is
  'Busqueda por nombre en la bandeja: coincidencia parcial, por eso trigramas.';