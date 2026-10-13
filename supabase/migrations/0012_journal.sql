-- v2 Phase 1: private journal entries and three-tier memory.
--
-- Both tables are private to their owner. Nothing on the team side
-- (shared_items, team summaries — later phases) reads from them.

-- ---------------------------------------------------------------------------
-- entries: one row per journal entry. The id is generated on the device so an
-- entry written offline keeps the same id when it syncs, and re-sending it is a
-- harmless upsert rather than a duplicate.
-- ---------------------------------------------------------------------------
create table if not exists public.entries (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null default now(),
  reply text,
  reflected_at timestamptz
);

create index if not exists entries_user_updated_idx on public.entries (user_id, updated_at);
create index if not exists entries_user_created_idx on public.entries (user_id, created_at desc);

alter table public.entries enable row level security;

drop policy if exists "entries_select_own" on public.entries;
create policy "entries_select_own" on public.entries
  for select using (auth.uid() = user_id);

drop policy if exists "entries_insert_own" on public.entries;
create policy "entries_insert_own" on public.entries
  for insert with check (auth.uid() = user_id);

drop policy if exists "entries_update_own" on public.entries;
create policy "entries_update_own" on public.entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- No delete policy: entries are never removed from the server in Phase 1.

-- ---------------------------------------------------------------------------
-- memory: three markdown documents per person.
--   long     — who you are, values, long arcs (changes rarely)
--   short    — the current season: projects, goals in motion
--   everyday — dated one-line log of what happened, wins, things done
-- ---------------------------------------------------------------------------
create table if not exists public.memory (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tier text not null check (tier in ('long', 'short', 'everyday')),
  content text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, tier)
);

alter table public.memory enable row level security;

drop policy if exists "memory_select_own" on public.memory;
create policy "memory_select_own" on public.memory
  for select using (auth.uid() = user_id);

drop policy if exists "memory_insert_own" on public.memory;
create policy "memory_insert_own" on public.memory
  for insert with check (auth.uid() = user_id);

drop policy if exists "memory_update_own" on public.memory;
create policy "memory_update_own" on public.memory
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- updated_at bookkeeping, so devices can pull "everything changed since X".
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists entries_touch_updated_at on public.entries;
create trigger entries_touch_updated_at
  before update on public.entries
  for each row execute function public.touch_updated_at();

drop trigger if exists memory_touch_updated_at on public.memory;
create trigger memory_touch_updated_at
  before update on public.memory
  for each row execute function public.touch_updated_at();
