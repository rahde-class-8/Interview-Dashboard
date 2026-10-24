-- Phase 5: recording storage.
--
-- Audio binaries live only in the private Storage bucket "recordings". Clients
-- never read or write storage.objects directly: there are deliberately NO
-- policies on storage.objects, so the Storage API denies every request made
-- with a user or anon key. The application server issues path-scoped signed
-- upload URLs and short-lived signed playback URLs with the secret key.
--
-- This migration adds:
--   * the bucket (private, 100 MiB limit, MP3/M4A/WAV MIME types only);
--   * a status-transition guard and the upload limits (quota, per-call count);
--   * retention bookkeeping (delete_after) that follows workspace settings;
--   * service-only functions for status changes, rate limits and maintenance.

-- ---------------------------------------------------------------------------
-- Bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recordings', 'recordings', false, 104857600, array['audio/mpeg', 'audio/mp4', 'audio/wav'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Hard ceiling matching the bucket limit; the application limit
-- (NEXT_PUBLIC_MAX_RECORDING_SIZE_MB) can only be lower.
alter table public.recordings
  add constraint recordings_file_size_max check (file_size <= 104857600);

-- Upload limits that the application may lower but never exceed.
alter table public.workspaces
  add constraint workspaces_storage_quota_max check (storage_quota_bytes <= 107374182400);

-- ---------------------------------------------------------------------------
-- Status lifecycle
--
--   pending ──complete──▶ uploaded ──delete / retention──▶ deleted
--      │                                                    ▲
--      ├──validation failed / abandoned──▶ failed ───────────┘ (tombstone purge)
--      └──delete──▶ deleted
-- ---------------------------------------------------------------------------

create function app.guard_recording_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if not (
    (old.status = 'pending' and new.status in ('uploaded', 'failed', 'deleted'))
    or (old.status in ('uploaded', 'failed') and new.status = 'deleted')
  ) then
    raise exception 'A recording cannot change from % to %.', old.status, new.status
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger guard_status before update of status on public.recordings
  for each row execute function app.guard_recording_status();

-- Queue storage cleanup whenever an object stops being live. The reason can be
-- set for the transaction with set_config('app.cleanup_reason', …, true).
create or replace function app.enqueue_recording_cleanup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(current_setting('app.cleanup_reason', true), '');
begin
  if tg_op = 'UPDATE' then
    if new.status in ('deleted', 'failed') and old.status in ('pending', 'uploaded') then
      insert into public.storage_cleanup_queue (workspace_id, bucket, storage_path, reason)
      values (old.workspace_id, 'recordings', old.storage_path,
              coalesce(v_reason, case new.status when 'deleted' then 'user_delete' else 'failed_validation' end));
    end if;
    return new;
  end if;

  -- Hard delete (direct or via cascade from call / opportunity / workspace).
  -- Rows already failed or soft-deleted were queued at that time.
  if old.status in ('pending', 'uploaded') then
    insert into public.storage_cleanup_queue (workspace_id, bucket, storage_path, reason)
    values (old.workspace_id, 'recordings', old.storage_path, coalesce(v_reason, 'cascade'));
  end if;
  return old;
end;
$$;

drop trigger enqueue_cleanup_on_soft_delete on public.recordings;
create trigger enqueue_cleanup_on_status_change after update of status on public.recordings
  for each row execute function app.enqueue_recording_cleanup();

-- ---------------------------------------------------------------------------
-- Upload limits (enforced for every insert path, not only the API)
-- ---------------------------------------------------------------------------

create function app.enforce_recording_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quota bigint;
  v_used  bigint;
  v_count integer;
begin
  -- Serialize uploads per workspace so concurrent inserts cannot overshoot the quota.
  perform pg_advisory_xact_lock(hashtextextended('recordings:' || new.workspace_id::text, 0));

  select w.storage_quota_bytes into v_quota from public.workspaces w where w.id = new.workspace_id;

  select coalesce(sum(r.file_size), 0) into v_used
  from public.recordings r
  where r.workspace_id = new.workspace_id and r.status in ('pending', 'uploaded');

  if v_used + new.file_size > v_quota then
    raise exception 'Workspace storage quota exceeded.'
      using errcode = 'P0001', hint = 'quota_exceeded';
  end if;

  select count(*) into v_count
  from public.recordings r
  where r.recruiter_call_id = new.recruiter_call_id and r.status in ('pending', 'uploaded');

  if v_count >= 10 then
    raise exception 'A call can have at most 10 recordings.'
      using errcode = 'P0001', hint = 'call_limit';
  end if;

  return new;
end;
$$;

create trigger enforce_limits before insert on public.recordings
  for each row execute function app.enforce_recording_limits();

-- ---------------------------------------------------------------------------
-- Retention: delete_after = uploaded_at + workspace retention (NULL = keep)
-- ---------------------------------------------------------------------------

create function app.retention_deadline(p_workspace_id uuid, p_uploaded_at timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select p_uploaded_at + make_interval(days => w.recording_retention_days)
  from public.workspaces w
  where w.id = p_workspace_id;
$$;

-- Changing the workspace setting applies to existing recordings as well.
create function app.apply_retention_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.recordings r
  set delete_after = r.uploaded_at + make_interval(days => new.recording_retention_days)
  where r.workspace_id = new.id and r.status = 'uploaded';
  return new;
end;
$$;

create trigger apply_retention_change
  after update of recording_retention_days on public.workspaces
  for each row
  when (old.recording_retention_days is distinct from new.recording_retention_days)
  execute function app.apply_retention_change();

-- ---------------------------------------------------------------------------
-- Service-only status transitions (called by the API server with the secret key)
-- ---------------------------------------------------------------------------

create function public.mark_recording_uploaded(p_id uuid)
returns public.recordings
language plpgsql
set search_path = ''
as $$
declare
  v_row public.recordings;
begin
  update public.recordings r
  set status = 'uploaded',
      uploaded_at = now(),
      delete_after = app.retention_deadline(r.workspace_id, now()),
      failure_reason = null
  where r.id = p_id and r.status = 'pending'
  returning r.* into v_row;

  if not found then
    raise exception 'Only a pending recording can be completed.' using errcode = 'P0001';
  end if;
  return v_row;
end;
$$;

create function public.mark_recording_failed(p_id uuid, p_reason text, p_cleanup_reason text default 'failed_validation')
returns public.recordings
language plpgsql
set search_path = ''
as $$
declare
  v_row public.recordings;
begin
  perform set_config('app.cleanup_reason', p_cleanup_reason, true);
  update public.recordings r
  set status = 'failed', failure_reason = left(p_reason, 500)
  where r.id = p_id and r.status = 'pending'
  returning r.* into v_row;

  if not found then
    raise exception 'Only a pending recording can fail.' using errcode = 'P0001';
  end if;
  perform set_config('app.cleanup_reason', '', true);
  return v_row;
end;
$$;

create function public.soft_delete_recording(p_id uuid)
returns public.recordings
language plpgsql
set search_path = ''
as $$
declare
  v_row public.recordings;
begin
  update public.recordings r
  set status = 'deleted', deleted_at = now(), delete_after = null
  where r.id = p_id and r.status <> 'deleted'
  returning r.* into v_row;

  if not found then
    raise exception 'Recording not found.' using errcode = 'P0002';
  end if;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rate limits (fixed windows, service-only)
-- ---------------------------------------------------------------------------

create table public.rate_limit_counters (
  id            uuid primary key default gen_random_uuid(),
  subject       uuid not null,
  action        text not null check (char_length(action) between 1 and 64),
  window_start  timestamptz not null,
  hits          integer not null default 0 check (hits >= 0),
  unique (subject, action, window_start)
);
comment on table public.rate_limit_counters is 'Per-user fixed-window counters for expensive actions. Service role only.';
alter table public.rate_limit_counters enable row level security;
alter table public.rate_limit_counters force row level security;
revoke all on public.rate_limit_counters from anon, authenticated;

-- Records one hit and returns true while the subject is within the limit.
create function public.consume_rate_limit(p_subject uuid, p_action text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits   integer;
begin
  insert into public.rate_limit_counters as c (subject, action, window_start, hits)
  values (p_subject, p_action, v_window, 1)
  on conflict (subject, action, window_start) do update set hits = c.hits + 1
  returning c.hits into v_hits;
  return v_hits <= p_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Maintenance (scheduled; service-only)
-- ---------------------------------------------------------------------------

alter table public.storage_cleanup_queue add column locked_until timestamptz;

-- Claims up to p_limit queue entries for one worker. A claim expires after
-- five minutes, so a crashed worker's entries are retried by the next run.
create function public.claim_storage_cleanup(p_limit integer default 100)
returns setof public.storage_cleanup_queue
language sql
set search_path = ''
as $$
  update public.storage_cleanup_queue q
  set attempts = q.attempts + 1, locked_until = now() + interval '5 minutes'
  where q.id in (
    select c.id
    from public.storage_cleanup_queue c
    where c.completed_at is null
      and c.attempts < 10
      and (c.locked_until is null or c.locked_until < now())
    order by c.enqueued_at
    limit greatest(p_limit, 0)
    for update skip locked
  )
  returning q.*;
$$;

-- Database-side maintenance; returns counts of what changed. Storage objects
-- themselves are removed by the application worker from the cleanup queue.
create function public.run_recording_maintenance(
  p_abandon_after   interval default interval '24 hours',
  p_tombstone_after interval default interval '30 days'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_abandoned  integer;
  v_expired    integer;
  v_orphans    integer;
  v_tombstones integer;
begin
  -- 1. Uploads never completed: fail them and queue whatever reached Storage.
  perform set_config('app.cleanup_reason', 'abandoned', true);
  update public.recordings r
  set status = 'failed', failure_reason = 'The upload was not completed.'
  where r.status = 'pending' and r.created_at < now() - p_abandon_after;
  get diagnostics v_abandoned = row_count;

  -- 2. Retention period over.
  perform set_config('app.cleanup_reason', 'retention', true);
  update public.recordings r
  set status = 'deleted', deleted_at = now(), delete_after = null
  where r.status = 'uploaded' and r.delete_after <= now();
  get diagnostics v_expired = row_count;
  perform set_config('app.cleanup_reason', '', true);

  -- 3. Orphaned objects: in the bucket, but no live recording points at them
  --    (e.g. an upload that finished after its recording was deleted).
  insert into public.storage_cleanup_queue (workspace_id, bucket, storage_path, reason)
  select coalesce(r.workspace_id, (split_part(o.name, '/', 1))::uuid), 'recordings', o.name, 'abandoned'
  from storage.objects o
  left join public.recordings r on r.storage_path = o.name
  where o.bucket_id = 'recordings'
    and o.created_at < now() - interval '1 hour'
    and (r.id is null or r.status not in ('pending', 'uploaded'))
    and split_part(o.name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and not exists (
      select 1 from public.storage_cleanup_queue q
      where q.bucket = 'recordings' and q.storage_path = o.name and q.completed_at is null
    );
  get diagnostics v_orphans = row_count;

  -- 4. Tombstones: failed/deleted metadata older than the grace period.
  delete from public.recordings r
  where r.status in ('failed', 'deleted') and r.updated_at < now() - p_tombstone_after;
  get diagnostics v_tombstones = row_count;

  -- 5. Housekeeping.
  delete from public.storage_cleanup_queue q where q.completed_at < now() - interval '30 days';
  delete from public.rate_limit_counters c where c.window_start < now() - interval '2 days';

  return jsonb_build_object(
    'abandoned', v_abandoned,
    'expired', v_expired,
    'orphansQueued', v_orphans,
    'tombstonesPurged', v_tombstones
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: every function above is for the service role only.
-- ---------------------------------------------------------------------------

revoke all on function public.mark_recording_uploaded(uuid) from public, anon, authenticated;
revoke all on function public.mark_recording_failed(uuid, text, text) from public, anon, authenticated;
revoke all on function public.soft_delete_recording(uuid) from public, anon, authenticated;
revoke all on function public.consume_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.claim_storage_cleanup(integer) from public, anon, authenticated;
revoke all on function public.run_recording_maintenance(interval, interval) from public, anon, authenticated;
revoke all on function app.guard_recording_status() from public;
revoke all on function app.enforce_recording_limits() from public;
revoke all on function app.retention_deadline(uuid, timestamptz) from public;
revoke all on function app.apply_retention_change() from public;

grant execute on function public.mark_recording_uploaded(uuid) to service_role;
grant execute on function public.mark_recording_failed(uuid, text, text) to service_role;
grant execute on function public.soft_delete_recording(uuid) to service_role;
grant execute on function public.consume_rate_limit(uuid, text, integer, integer) to service_role;
grant execute on function public.claim_storage_cleanup(integer) to service_role;
grant execute on function public.run_recording_maintenance(interval, interval) to service_role;
grant execute on function app.retention_deadline(uuid, timestamptz) to service_role;
grant select on storage.objects to service_role;
grant all on public.rate_limit_counters to service_role;

-- ---------------------------------------------------------------------------
-- Computed field for the API: playable recordings per call (RLS applies).
-- Selected as `recording_count:uploaded_recording_count`.
-- ---------------------------------------------------------------------------

create function public.uploaded_recording_count(c public.recruiter_calls)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from public.recordings r
  where r.recruiter_call_id = c.id and r.workspace_id = c.workspace_id and r.status = 'uploaded';
$$;

revoke all on function public.uploaded_recording_count(public.recruiter_calls) from public, anon;
grant execute on function public.uploaded_recording_count(public.recruiter_calls) to authenticated, service_role;
