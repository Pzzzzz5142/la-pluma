-- Enable UUID extension
create extension if not exists "pgcrypto";

-- Notes table
create table if not exists notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null default '',
  content     jsonb not null default '{}',
  mode        text not null default 'quick' check (mode in ('quick', 'article')),
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Index for listing notes by user, newest first
create index if not exists notes_user_id_updated_at_idx
  on notes (user_id, updated_at desc);

-- Auto-update updated_at on row change
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger notes_updated_at
  before update on notes
  for each row execute procedure update_updated_at();

-- Row Level Security
alter table notes enable row level security;

create policy "Users can read their own notes"
  on notes for select
  using (auth.uid() = user_id);

create policy "Users can insert their own notes"
  on notes for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own notes"
  on notes for update
  using (auth.uid() = user_id);

create policy "Users can delete their own notes"
  on notes for delete
  using (auth.uid() = user_id);
