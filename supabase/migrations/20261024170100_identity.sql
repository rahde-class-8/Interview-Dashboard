-- Identity and workspace ownership: profiles, workspaces, members, invitations.

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         extensions.citext not null unique,
  display_name  text not null check (char_length(display_name) between 1 and 120),
  headline      text check (char_length(headline) <= 200),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.profiles is 'Application profile for each auth user (1:1 with auth.users).';

create table public.workspaces (
  id                        uuid primary key default gen_random_uuid(),
  name                      text not null check (char_length(name) between 1 and 120),
  owner_id                  uuid not null references public.profiles (id) on delete cascade,
  recording_retention_days  integer check (recording_retention_days in (30, 90, 180, 365)),
  storage_quota_bytes       bigint not null default 2147483648 check (storage_quota_bytes > 0),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
comment on table public.workspaces is 'Tenant boundary. Deleting a workspace cascades to all of its records.';
comment on column public.workspaces.recording_retention_days is 'NULL = keep recordings until deleted.';
create index workspaces_owner_idx on public.workspaces (owner_id);

create table public.workspace_members (
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  role          text not null check (role in ('owner', 'editor', 'commenter', 'viewer')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create unique index workspace_members_one_owner on public.workspace_members (workspace_id) where role = 'owner';
create index workspace_members_user_idx on public.workspace_members (user_id);

create table public.workspace_invitations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  email         extensions.citext not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role          text not null check (role in ('editor', 'commenter', 'viewer')),
  token_hash    bytea not null unique check (octet_length(token_hash) = 32),
  invited_by    uuid references public.profiles (id) on delete set null,
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at    timestamptz not null default now() + interval '7 days',
  accepted_by   uuid references public.profiles (id) on delete set null,
  accepted_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check ((status = 'accepted') = (accepted_at is not null))
);
comment on column public.workspace_invitations.token_hash is 'SHA-256 of the emailed token; the raw token is never stored.';
create unique index workspace_invitations_one_pending on public.workspace_invitations (workspace_id, email) where status = 'pending';
create index workspace_invitations_workspace_idx on public.workspace_invitations (workspace_id);

create trigger set_updated_at before update on public.profiles
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.workspaces
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.workspace_members
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.workspace_invitations
  for each row execute function app.set_updated_at();

-- A new workspace always gets its owner as an 'owner' member, in the same transaction.
create function app.add_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger add_owner_membership after insert on public.workspaces
  for each row execute function app.add_workspace_owner();

-- The member referenced by workspaces.owner_id cannot be demoted or removed.
-- Ownership changes must update workspaces.owner_id first (transfer function, Phase 6).
-- Cascading deletes of the workspace or the owner's profile are allowed.
create function app.protect_workspace_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner' or new.user_id <> old.user_id)
     and exists (
       select 1 from public.workspaces w
       where w.id = old.workspace_id and w.owner_id = old.user_id
     )
  then
    raise exception 'The workspace owner cannot be removed or demoted; transfer ownership first'
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger protect_owner before update or delete on public.workspace_members
  for each row execute function app.protect_workspace_owner();

-- Sign-up bootstrap: profile + personal workspace (+ owner membership via trigger).
create function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    split_part(new.email, '@', 1)
  );
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, left(v_name, 120));

  insert into public.workspaces (name, owner_id)
  values (left(v_name || '''s workspace', 120), new.id);

  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- Keep profile email in sync when the auth email changes.
create function app.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function app.sync_profile_email();

-- Deny by default: RLS on, no policies yet (Phase 3 adds them).
alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.workspaces enable row level security;
alter table public.workspaces force row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_members force row level security;
alter table public.workspace_invitations enable row level security;
alter table public.workspace_invitations force row level security;
