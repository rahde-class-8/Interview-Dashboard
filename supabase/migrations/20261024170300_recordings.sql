-- Recording metadata. Audio binaries live only in private Supabase Storage
-- (bucket "recordings", created in Phase 5); this table never stores audio.

create table public.recordings (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null,
  recruiter_call_id     uuid not null,
  uploaded_by           uuid references public.profiles (id) on delete set null,
  file_name             text not null check (char_length(file_name) between 1 and 255),
  storage_path          text not null unique check (char_length(storage_path) between 1 and 1024),
  mime_type             text not null check (mime_type in ('audio/mpeg', 'audio/mp4', 'audio/wav')),
  file_size             bigint not null check (file_size > 0),
  duration_seconds      integer check (duration_seconds between 0 and 86400),
  status                text not null default 'pending'
                        check (status in ('pending', 'uploaded', 'failed', 'deleted')),
  failure_reason        text check (char_length(failure_reason) <= 500),
  consent_confirmed_at  timestamptz not null,
  uploaded_at           timestamptz,
  delete_after          timestamptz,
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  foreign key (recruiter_call_id, workspace_id)
    references public.recruiter_calls (id, workspace_id) on delete cascade,
  constraint recordings_uploaded_state check (status <> 'uploaded' or (uploaded_at is not null and deleted_at is null)),
  constraint recordings_deleted_state check ((status = 'deleted') = (deleted_at is not null)),
  -- Object keys are always {workspace_id}/{recruiter_call_id}/{id}.{ext}; never user-supplied.
  constraint recordings_path_shape check (
    storage_path = workspace_id::text || '/' || recruiter_call_id::text || '/' || id::text
                   || '.' || case mime_type when 'audio/mpeg' then 'mp3' when 'audio/mp4' then 'm4a' else 'wav' end
  )
);
comment on table public.recordings is 'Metadata for externally created call recordings stored in private Storage.';
create index recordings_call_idx on public.recordings (recruiter_call_id) where status <> 'deleted';
create index recordings_workspace_status_idx on public.recordings (workspace_id, status);
create index recordings_retention_idx on public.recordings (delete_after) where status = 'uploaded';
create index recordings_pending_idx on public.recordings (created_at) where status = 'pending';

create trigger set_updated_at before update on public.recordings
  for each row execute function app.set_updated_at();

-- Storage objects are not removed by foreign-key cascades. Every path that must be
-- purged is queued here and removed by a scheduled job (Phase 5).
create table public.storage_cleanup_queue (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null,  -- intentionally no FK: entries must survive workspace deletion
  bucket        text not null,
  storage_path  text not null,
  reason        text not null check (reason in ('user_delete', 'cascade', 'retention', 'abandoned', 'failed_validation', 'account_deletion')),
  attempts      integer not null default 0 check (attempts >= 0),
  last_error    text,
  enqueued_at   timestamptz not null default now(),
  completed_at  timestamptz
);
create index storage_cleanup_queue_pending_idx on public.storage_cleanup_queue (enqueued_at) where completed_at is null;

create function app.enqueue_recording_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- Soft delete by the application.
    if new.status = 'deleted' and old.status <> 'deleted' then
      insert into public.storage_cleanup_queue (workspace_id, bucket, storage_path, reason)
      values (old.workspace_id, 'recordings', old.storage_path, 'user_delete');
    end if;
    return new;
  end if;

  -- Hard delete (direct or via cascade from call / opportunity / workspace).
  -- Rows already soft-deleted were queued at that time.
  if old.status <> 'deleted' then
    insert into public.storage_cleanup_queue (workspace_id, bucket, storage_path, reason)
    values (old.workspace_id, 'recordings', old.storage_path, 'cascade');
  end if;
  return old;
end;
$$;

create trigger enqueue_cleanup_on_soft_delete after update of status on public.recordings
  for each row execute function app.enqueue_recording_cleanup();
create trigger enqueue_cleanup_on_delete before delete on public.recordings
  for each row execute function app.enqueue_recording_cleanup();

alter table public.recordings enable row level security;
alter table public.recordings force row level security;
alter table public.storage_cleanup_queue enable row level security;
alter table public.storage_cleanup_queue force row level security;

-- The cleanup queue is service-only: no access for client roles, ever.
revoke all on public.storage_cleanup_queue from anon, authenticated;
