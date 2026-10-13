-- Phase 5: team chat with realtime + assistant insights.

create table if not exists public.team_messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  -- 'human' messages come from members; 'assistant' from the insight job.
  kind text not null default 'human' check (kind in ('human', 'assistant')),
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists team_messages_team_created_idx
  on public.team_messages (team_id, created_at desc);

alter table public.team_messages enable row level security;

drop policy if exists "team_messages_select_member" on public.team_messages;
create policy "team_messages_select_member"
  on public.team_messages for select
  using (public.is_team_member(team_id));

drop policy if exists "team_messages_insert_member_self" on public.team_messages;
create policy "team_messages_insert_member_self"
  on public.team_messages for insert
  with check (
    public.is_team_member(team_id)
    and (
      (kind = 'human' and author_id = auth.uid())
      or (kind = 'assistant' and author_id is null)
    )
  );

-- Enable realtime for the team_messages table.
alter publication supabase_realtime add table public.team_messages;
