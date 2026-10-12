-- Las resenas necesitan recordar la respuesta que se publico y quien la escribio.
--
-- Hasta ahora la tabla sabia que una resena estaba respondida (`replied_at`) pero no CON QUE texto ni
-- por quien: con el bot respondiendo solo las de cuatro y cinco estrellas y las de una a tres
-- pasando a una persona, hacia falta distinguir las dos cosas. Google guarda UNA sola respuesta del
-- propietario y publicar otra la reemplaza, asi que saber que se dijo y quien lo dijo es lo que
-- permite no pisar una respuesta escrita a mano.
--
-- `routed_to_human_at` marca el momento en que una resena se derivo a una persona. Es lo que
-- distingue "nadie la ha mirado todavia" de "esta esperando respuesta en la bandeja de resenas".

alter table public.google_business_reviews
  add column if not exists reply_comment text,
  add column if not exists reply_author_user_id uuid references auth.users (id) on delete set null,
  add column if not exists reply_source text,
  add column if not exists routed_to_human_at timestamptz;

alter table public.google_business_reviews
  drop constraint if exists google_business_reviews_reply_source_check;

alter table public.google_business_reviews
  add constraint google_business_reviews_reply_source_check
    check (reply_source is null or reply_source in ('bot', 'advisor'));

comment on column public.google_business_reviews.reply_comment is
  'Texto de la respuesta publicada. Google guarda una sola: publicar otra reemplaza esta.';
comment on column public.google_business_reviews.reply_author_user_id is
  'Quien respondio, cuando respondio una persona. Nulo si respondio el bot.';
comment on column public.google_business_reviews.reply_source is
  'bot o advisor. Se escribe junto con replied_at, en la misma operacion.';
comment on column public.google_business_reviews.routed_to_human_at is
  'Instante en que la resena se derivo a una persona para que la responda desde la bandeja.';

-- La bandeja de resenas pide justo esto: las de este espacio que siguen sin respuesta.
create index if not exists google_business_reviews_pending_idx
  on public.google_business_reviews (tenant_id, rating, review_updated_at desc)
  where replied_at is null;

-- Reversion: quitar el indice y las cuatro columnas. Se pierde el registro de que se respondio y con
-- que texto, no las resenas.
