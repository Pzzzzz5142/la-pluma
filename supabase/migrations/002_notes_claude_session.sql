-- Add Claude session tracking to notes
alter table notes add column if not exists claude_session_id text;
alter table notes add column if not exists chat_version int not null default 0;
