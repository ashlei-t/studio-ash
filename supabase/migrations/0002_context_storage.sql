-- Phase 3: per-user Storage bucket for identity.md / season.md / thinkies.md.
-- Run after 0001_profiles.sql. Files live at `<auth.uid()>/<filename>`.

insert into storage.buckets (id, name, public)
values ('context', 'context', false)
on conflict (id) do nothing;

-- A user may read, insert, update, and delete only objects under their own
-- top-level prefix in the `context` bucket.

drop policy if exists "context_select_own" on storage.objects;
create policy "context_select_own"
  on storage.objects for select
  using (
    bucket_id = 'context'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "context_insert_own" on storage.objects;
create policy "context_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'context'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "context_update_own" on storage.objects;
create policy "context_update_own"
  on storage.objects for update
  using (
    bucket_id = 'context'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "context_delete_own" on storage.objects;
create policy "context_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'context'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
