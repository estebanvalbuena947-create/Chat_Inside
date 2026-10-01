-- Color de las etiquetas: se asigna solo al crearlas, para que el equipo distinga de un vistazo.

alter table public.labels
  add column color text;

-- Las etiquetas que ya existian reciben un color de la misma paleta, por orden de creacion.
with paleta as (
  select array[
    '#f6d5d5', '#f9e2c8', '#f7f0c6', '#d9edcc', '#cfe8e4', '#d3e2f7', '#e0d7f5', '#f6d9ec'
  ] as colores
),
numeradas as (
  select id, row_number() over (partition by tenant_id order by created_at, id) as posicion
  from public.labels
)
update public.labels as etiqueta
set color = paleta.colores[((numeradas.posicion - 1) % array_length(paleta.colores, 1)) + 1]
from numeradas, paleta
where etiqueta.id = numeradas.id and etiqueta.color is null;

alter table public.labels
  alter column color set not null,
  add constraint labels_color_format_check check (color ~ '^#[0-9a-f]{6}$');

comment on column public.labels.color is
  'Color pastel de la etiqueta, asignado al crearla. La paleta vive en el dominio.';
