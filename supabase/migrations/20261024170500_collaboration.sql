-- Collaboration: shared notes, comments, activity events.

create table public.shared_notes (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  opportunity_id  uuid,
  title           text not null check (char_length(trim(title)) between 1 and 200),
  body            text not null default '' check (char_length(body) <= 100000),
  version         integer not null default 1 check (version >= 1),  -- optimistic concurrency
  created_by      uuid references public.profiles (id) on delete set null,
  updated_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (opportunity_id, workspace_id)
    references public.opportunities (id, workspace_id) on delete set null (opportunity_id)
);
create index shared_notes_workspace_idx on public.shared_notes (workspace_id, updated_at desc);
create index shared_notes_opportunity_idx on public.shared_notes (opportunity_id);

-- Every content change increments the version.
create function app.bump_note_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.title, new.body, new.opportunity_id) is distinct from (old.title, old.body, old.opportunity_id) then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  return new;
end;
$$;

create trigger bump_version before update on public.shared_notes
  for each row execute function app.bump_note_version();

create table public.comments (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,
  note_id       uuid not null,
  author_id     uuid references public.profiles (id) on delete set null,
  body          text not null check (char_length(trim(body)) between 1 and 5000),
  edited_at     timestamptz,
  deleted_at    timestamptz,  -- soft delete keeps thread order; body is cleared by the service
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (note_id, workspace_id)
    references public.shared_notes (id, workspace_id) on delete cascade
);
create index comments_note_idx on public.comments (note_id, created_at);
create index comments_author_idx on public.comments (author_id);

create table public.activity_events (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  actor_id      uuid references public.profiles (id) on delete set null,
  action        text not null check (action ~ '^[a-z_]+\.[a-z_]+$'),  -- e.g. 'opportunity.stage_changed'
  entity_type   text not null check (char_length(entity_type) between 1 and 50),
  entity_id     uuid,
  metadata      jsonb not null default '{}'::jsonb
                check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 4096),
  created_at    timestamptz not null default now()
);
comment on column public.activity_events.metadata is 'Display labels only — never notes, contact details, storage paths or URLs.';
create index activity_events_workspace_time_idx on public.activity_events (workspace_id, created_at desc);

-- Activity is append-only for everyone except the privileged maintenance roles.
create function app.prevent_activity_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'activity_events is append-only' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger append_only before update or delete on public.activity_events
  for each row execute function app.prevent_activity_mutation();

create trigger set_updated_at before update on public.shared_notes
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.comments
  for each row execute function app.set_updated_at();

alter table public.shared_notes enable row level security;
alter table public.shared_notes force row level security;
alter table public.comments enable row level security;
alter table public.comments force row level security;
alter table public.activity_events enable row level security;
alter table public.activity_events force row level security;
