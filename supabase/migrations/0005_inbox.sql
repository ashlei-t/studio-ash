-- Phase 6: inbox for assistant-generated confirmations.

create table if not exists public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('personal', 'team')),
  user_id uuid references auth.users(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  title text not null,
  body text not null default '',
  -- Array of { file, mode, content } objects matching the chat update format.
  suggested_updates jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (
    (scope = 'personal' and user_id is not null and team_id is null)
    or (scope = 'team' and team_id is not null)
  )
);

create index if not exists inbox_items_personal_idx
  on public.inbox_items (user_id, status, created_at desc)
  where scope = 'personal';

create index if not exists inbox_items_team_idx
  on public.inbox_items (team_id, status, created_at desc)
  where scope = 'team';

alter table public.inbox_items enable row level security;

drop policy if exists "inbox_select_relevant" on public.inbox_items;
create policy "inbox_select_relevant"
  on public.inbox_items for select
  using (
    (scope = 'personal' and user_id = auth.uid())
    or (scope = 'team' and public.is_team_member(team_id))
  );

drop policy if exists "inbox_insert_relevant" on public.inbox_items;
create policy "inbox_insert_relevant"
  on public.inbox_items for insert
  with check (
    (scope = 'personal' and user_id = auth.uid())
    or (scope = 'team' and public.is_team_member(team_id))
  );

drop policy if exists "inbox_update_relevant" on public.inbox_items;
create policy "inbox_update_relevant"
  on public.inbox_items for update
  using (
    (scope = 'personal' and user_id = auth.uid())
    or (scope = 'team' and public.is_team_member(team_id))
  );
