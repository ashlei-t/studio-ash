-- Fix: creator must be able to SELECT their own team row immediately after INSERT
-- (PostgREST .select().single() runs in same txn as trigger-added membership).

drop policy if exists "teams_select_member" on public.teams;
create policy "teams_select_member"
  on public.teams for select
  using (created_by = auth.uid() or public.is_team_member(id));
