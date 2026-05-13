-- Code-based team invites (shareable link). Replaces email-based team_invites.

drop policy if exists "team_invites_update_owner_or_invitee" on public.team_invites;
drop policy if exists "team_invites_insert_admin" on public.team_invites;
drop policy if exists "team_invites_select_relevant" on public.team_invites;

drop table if exists public.team_invites cascade;

create table public.team_invites (
  token uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null
);

create index team_invites_team_idx on public.team_invites(team_id);

alter table public.team_invites enable row level security;

-- Team members can see invites for their teams (e.g. list in UI).
drop policy if exists "team_invites_select_member" on public.team_invites;
create policy "team_invites_select_member"
  on public.team_invites for select
  using (public.is_team_member(team_id));

-- Owners/admins create invite links.
drop policy if exists "team_invites_insert_admin" on public.team_invites;
create policy "team_invites_insert_admin"
  on public.team_invites for insert
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.team_members
      where team_id = team_invites.team_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- Admins can revoke (mark accepted early / delete) — for beta, allow delete by admin.
drop policy if exists "team_invites_delete_admin" on public.team_invites;
create policy "team_invites_delete_admin"
  on public.team_invites for delete
  using (
    exists (
      select 1 from public.team_members
      where team_id = team_invites.team_id
        and user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- Redeem runs as security definer; no client UPDATE policy needed for accept path.

create or replace function public.redeem_invite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select team_id into v_team_id
  from public.team_invites
  where token = p_token
    and accepted_at is null
    and expires_at > now();

  if v_team_id is null then
    raise exception 'invalid or expired invite';
  end if;

  insert into public.team_members (team_id, user_id, role)
  values (v_team_id, auth.uid(), 'member')
  on conflict (team_id, user_id) do nothing;

  update public.team_invites
  set accepted_at = now(), accepted_by = auth.uid()
  where token = p_token;

  return v_team_id;
end;
$$;

grant execute on function public.redeem_invite(uuid) to authenticated;
