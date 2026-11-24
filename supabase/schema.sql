-- DSJ tracker database. Run once in Supabase → SQL Editor → New query → Run.
-- One table holds everything a signed-in person saves:
--   kind 'day'      key = date (YYYY-MM-DD)   data = { meals, exercises, u }
--   kind 'settings' key = 'main'              data = { goals, units, u }
--   kind 'note'     key = note id             data = { body, created, u, deleted }
-- Row-level security makes every row readable and writable only by its owner.

create table if not exists public.entries (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('day', 'settings', 'note')),
  key        text        not null check (char_length(key) between 1 and 64),
  data       jsonb       not null default '{}'::jsonb check (pg_column_size(data) < 250000),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, key)
);

alter table public.entries enable row level security;

drop policy if exists "Owners can read their entries" on public.entries;
drop policy if exists "Owners can add entries" on public.entries;
drop policy if exists "Owners can change their entries" on public.entries;
drop policy if exists "Owners can delete their entries" on public.entries;

create policy "Owners can read their entries" on public.entries
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owners can add entries" on public.entries
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owners can change their entries" on public.entries
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owners can delete their entries" on public.entries
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.entries to authenticated;
revoke all on public.entries from anon;
