-- Optional hint on assistant bubbles when an inbox suggestion was created in the same run.

alter table public.team_messages
  add column if not exists has_inbox_suggestion boolean not null default false;
