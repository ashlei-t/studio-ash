-- Phase 7: stream inbox_items changes so the panel updates live.
--
-- supabase_realtime is the default publication wired to the Realtime service.
-- Adding inbox_items lets the client subscribe to INSERT/UPDATE events
-- without polling.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'inbox_items'
  ) then
    alter publication supabase_realtime add table public.inbox_items;
  end if;
end $$;
