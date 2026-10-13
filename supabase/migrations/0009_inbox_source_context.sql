-- Optional excerpt of chat / context that motivated an inbox row (for reviewer UI).

alter table public.inbox_items
  add column if not exists source_context text not null default '';
