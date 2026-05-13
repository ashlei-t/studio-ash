-- Phase 4: teams, members, invites, and the shared `team` Storage bucket.

create extension if not exists pgcrypto;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_by uuid not null references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index if not exists team_members_user_idx on public.team_members(user_id);

create table if not exists public.team_invites (
  token uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null,
  invited_by uuid not null references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz
);

create index if not exists team_invites_team_idx on public.team_invites(team_id);
create index if not exists team_invites_email_idx on public.team_invites(lower(email));

-- Membership helper avoids recursive RLS subqueries.
create or replace function public.is_team_member(t_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.team_members
    where team_id = t_id and user_id = auth.uid()
  );
$$;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;

drop policy if exists "teams_select_member" on public.teams;
create policy "teams_select_member"
  on public.teams for select
  using (public.is_team_member(id));

drop policy if exists "teams_insert_self" on public.teams;
create policy "teams_insert_self"
  on public.teams for insert
  with check (created_by = auth.uid());

drop policy if exists "teams_update_admin" on public.teams;
create policy "teams_update_admin"
  on public.teams for update
  using (
    exists (
      select 1 from public.team_members
      where team_id = teams.id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

drop policy if exists "team_members_select_member" on public.team_members;
create policy "team_members_select_member"
  on public.team_members for select
  using (public.is_team_member(team_id));

drop policy if exists "team_members_insert_self" on public.team_members;
create policy "team_members_insert_self"
  on public.team_members for insert
  with check (user_id = auth.uid());

drop policy if exists "team_members_delete_self_or_admin" on public.team_members;
create policy "team_members_delete_self_or_admin"
  on public.team_members for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.team_members tm
      where tm.team_id = team_members.team_id
        and tm.user_id = auth.uid()
        and tm.role in ('owner', 'admin')
    )
  );

drop policy if exists "team_invites_select_relevant" on public.team_invites;
create policy "team_invites_select_relevant"
  on public.team_invites for select
  using (
    public.is_team_member(team_id)
    or lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  );

drop policy if exists "team_invites_insert_admin" on public.team_invites;
create policy "team_invites_insert_admin"
  on public.team_invites for insert
  with check (
    invited_by = auth.uid()
    and exists (
      select 1 from public.team_members
      where team_id = team_invites.team_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

drop policy if exists "team_invites_update_owner_or_invitee" on public.team_invites;
create policy "team_invites_update_owner_or_invitee"
  on public.team_invites for update
  using (
    lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
    or exists (
      select 1 from public.team_members
      where team_id = team_invites.team_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- When a user creates a team, make them owner.
create or replace function public.handle_new_team()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.team_members (team_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_team_created on public.teams;
create trigger on_team_created
  after insert on public.teams
  for each row execute function public.handle_new_team();

-- Shared Storage bucket for team context files: `<team_id>/identity.md` etc.
insert into storage.buckets (id, name, public)
values ('team', 'team', false)
on conflict (id) do nothing;

drop policy if exists "team_select_member" on storage.objects;
create policy "team_select_member"
  on storage.objects for select
  using (
    bucket_id = 'team'
    and public.is_team_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "team_insert_member" on storage.objects;
create policy "team_insert_member"
  on storage.objects for insert
  with check (
    bucket_id = 'team'
    and public.is_team_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "team_update_member" on storage.objects;
create policy "team_update_member"
  on storage.objects for update
  using (
    bucket_id = 'team'
    and public.is_team_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "team_delete_admin" on storage.objects;
create policy "team_delete_admin"
  on storage.objects for delete
  using (
    bucket_id = 'team'
    and exists (
      select 1 from public.team_members
      where team_id = ((storage.foldername(name))[1])::uuid
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );
