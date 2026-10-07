-- Canal en la multimedia de sede.
--
-- Contexto: los nodos que hoy lanzan flujos de ManyChat estan duplicados por canal
-- ("Enviar foto_accesoro IG IS", "Enviar foto_accesoro iG ISV", "Enviar foto_accesoro Tiktok ISV").
-- Y no es capricho: Instagram e TikTok no piden el mismo formato de imagen -- uno cuadrado, otro
-- vertical. La misma foto recortada a lo cuadrado se ve mal en TikTok y al reves.
--
-- La columna nace con 'any' por defecto, asi que NADA cambia para lo que ya exista: una imagen sin
-- canal sigue sirviendo en cualquier sitio. Y cuando haga falta una distinta por canal, se anade la
-- fila con su canal sin tocar la comun.
--
-- Es aditivo: la tabla esta vacia hoy, y aunque no lo estuviera, el valor por defecto rellena las
-- filas existentes.
--
-- Aditivo e idempotente.

alter table public.branch_media
  add column if not exists channel text not null default 'any';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'branch_media_channel_check'
  ) then
    alter table public.branch_media
      add constraint branch_media_channel_check
      check (channel in ('any', 'instagram', 'tiktok', 'facebook', 'whatsapp'));
  end if;
end $$;

comment on column public.branch_media.channel is
  'any, o el canal concreto cuando la imagen cambia de formato segun donde se mande.';

-- El indice de la consulta por sede y canal: la herramienta filtra por los dos.
create index if not exists branch_media_branch_channel_idx
  on public.branch_media (branch_id, channel);

-- Reversion: quitar el indice, la restriccion y la columna, en ese orden. Las imagenes ya
-- cargadas siguen en el almacen; lo unico que se pierde es a que canal pertenecia cada una, y
-- hasta hoy ninguna lo declara.
--
--   drop index if exists public.branch_media_branch_channel_idx;
--   alter table public.branch_media drop constraint if exists branch_media_channel_check;
--   alter table public.branch_media drop column if exists channel;
