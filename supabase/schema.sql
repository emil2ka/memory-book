-- Облако «Дневника-книги» (план 15, часть 2). Один раз в SQL Editor проекта Supabase.
-- Клиент — src/store/cloud.ts (mb-assets). Каждый видит только свои дни и свои снимки.
-- Ключ anon публичный, защита — эти правила (RLS).

create table if not exists public.days (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  date text not null,                         -- YYYY-MM-DD
  title text,
  text text not null,
  script jsonb not null,                      -- DayScript
  song jsonb,                                 -- StoredSong без файла: название, ссылка, yt
  photo_count integer not null default 0,     -- снимки в хранилище photos: <user_id>/<day_id>/<i>.jpg
  photo_palette jsonb,
  source text,                                -- DirectorSource
  seed integer not null default 1,
  created_at bigint not null,                 -- StoredDay.createdAt, мс
  updated_at timestamptz not null default now(),
  -- у двух людей может оказаться день с одним id (демо-дни) — ключ по паре
  primary key (user_id, id)
);

alter table public.days enable row level security;

drop policy if exists "days: only own" on public.days;
create policy "days: only own" on public.days
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- снимки дня: папка верхнего уровня — id пользователя
insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists "photos: read own" on storage.objects;
create policy "photos: read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "photos: add own" on storage.objects;
create policy "photos: add own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "photos: change own" on storage.objects;
create policy "photos: change own" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "photos: delete own" on storage.objects;
create policy "photos: delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
