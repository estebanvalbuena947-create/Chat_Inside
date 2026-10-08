-- Retirar un canal es DESCONECTAR, nunca borrar.
--
-- `conversations` y `messages` referencian `channel_accounts` con `on delete restrict`: borrar la
-- fila de un canal con historia romperia la bandeja. Por eso el canal retirado se marca con un
-- instante, y es ese instante el que lo saca de los listados operativos y del catalogo de
-- plantillas. La historia se conserva.
--
-- Aditiva y anulable: todos los canales existentes nacen operativos.
alter table public.channel_accounts
  add column disconnected_at timestamptz;

comment on column public.channel_accounts.disconnected_at is
  'Instante en que el canal se retiro (desconectado en el proveedor). Nulo mientras esta operativo.';
