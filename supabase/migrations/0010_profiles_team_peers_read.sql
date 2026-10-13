-- Phase 7: let teammates read each other's display_name from profiles.
--
-- The existing "profiles_select_own" policy restricts reads to the row's
-- owner (auth.uid() = id). That breaks team chat labels: a member can see
-- a teammate's auth.users.id (from team_messages.author_id) but cannot
-- resolve it to a display_name.
--
-- Postgres combines permissive policies with OR, so this second SELECT
-- policy only widens access for rows that share a team with the caller.

drop policy if exists "profiles_select_team_peers" on public.profiles;
create policy "profiles_select_team_peers"
  on public.profiles for select
  using (
    exists (
      select 1
      from public.team_members me
      join public.team_members peer
        on peer.team_id = me.team_id
      where me.user_id = auth.uid()
        and peer.user_id = profiles.id
    )
  );
