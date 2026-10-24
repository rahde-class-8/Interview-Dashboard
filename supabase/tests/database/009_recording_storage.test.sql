-- Phase 5: private bucket, storage isolation, upload limits, status lifecycle,
-- retention, rate limits and maintenance jobs.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(46);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000009a1', 'storage-owner@example.com'),
  ('00000000-0000-0000-0000-0000000009b2', 'storage-editor@example.com');
insert into workspaces (id, name, owner_id) values
  ('a9000000-0000-0000-0000-000000000000', 'Storage', '00000000-0000-0000-0000-0000000009a1');
insert into workspace_members (workspace_id, user_id, role) values
  ('a9000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000009b2', 'editor');
insert into companies (id, workspace_id, name) values
  ('c9000000-0000-0000-0000-000000000000', 'a9000000-0000-0000-0000-000000000000', 'Northwind Labs');
insert into opportunities (id, workspace_id, company_id, title, work_mode, employment_type) values
  ('09000000-0000-0000-0000-000000000000', 'a9000000-0000-0000-0000-000000000000', 'c9000000-0000-0000-0000-000000000000', 'SRE', 'remote', 'full_time');
insert into recruiter_calls (id, workspace_id, opportunity_id, call_at, duration_minutes, interest_level) values
  ('d9000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000000', '09000000-0000-0000-0000-000000000000', now(), 30, 7),
  ('d9000000-0000-0000-0000-000000000002', 'a9000000-0000-0000-0000-000000000000', '09000000-0000-0000-0000-000000000000', now(), 30, 7);

-- Runs a statement as a user; returns the scalar result, or 'denied' / 'error:<sqlstate>'.
create function pg_temp.as_user(p_user uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v text;
begin
  begin
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    execute p_sql into v;
  exception
    when insufficient_privilege then v := 'denied';
    when others then v := 'error:' || sqlstate;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return v;
end;
$$;

-- Inserts a pending MP3 recording with a server-shaped path; returns its id.
create function pg_temp.rec(p_n int, p_call uuid, p_size bigint)
returns uuid
language sql
as $$
  insert into public.recordings (id, workspace_id, recruiter_call_id, uploaded_by, file_name, storage_path, mime_type, file_size, consent_confirmed_at)
  values (('99900000-0000-0000-0000-' || lpad(p_n::text, 12, '0'))::uuid, 'a9000000-0000-0000-0000-000000000000', p_call,
          '00000000-0000-0000-0000-0000000009b2', 'call-' || p_n || '.mp3',
          'a9000000-0000-0000-0000-000000000000/' || p_call || '/99900000-0000-0000-0000-' || lpad(p_n::text, 12, '0') || '.mp3',
          'audio/mpeg', p_size, now())
  returning id;
$$;

create function pg_temp.queued(p_n int, p_reason text)
returns integer
language sql
as $$
  select count(*)::int from public.storage_cleanup_queue
  where reason = p_reason and storage_path like '%/99900000-0000-0000-0000-' || lpad(p_n::text, 12, '0') || '.mp3';
$$;

-- Bucket ------------------------------------------------------------------------------
select is(
  (select row(public, file_size_limit, allowed_mime_types)::text from storage.buckets where id = 'recordings'),
  row(false, 104857600::bigint, array['audio/mpeg', 'audio/mp4', 'audio/wav'])::text,
  'the recordings bucket is private, limited to 100 MiB and to MP3/M4A/WAV MIME types');
select is((select count(*)::int from storage.buckets where public), 0, 'no bucket is public');
select is((select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'), 0,
  'storage.objects has no policies: clients cannot access objects without a server-signed URL');

insert into storage.objects (bucket_id, name) values
  ('recordings', 'a9000000-0000-0000-0000-000000000000/d9000000-0000-0000-0000-000000000001/secret.mp3');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000009a1', $$select count(*) from storage.objects$$), '0',
  'even the workspace owner cannot list recording objects directly');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000009b2',
  $$insert into storage.objects (bucket_id, name) values ('recordings', 'a9000000-0000-0000-0000-000000000000/x/y.mp3') returning 1$$),
  'denied', 'editors cannot write recording objects directly');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000009a1',
  $$with u as (update storage.buckets set public = true where id = 'recordings' returning 1) select count(*) from u$$),
  '0', 'clients cannot change the bucket');
select is((select public from storage.buckets where id = 'recordings'), false, 'the bucket stays private');

-- Service-only functions and tables ---------------------------------------------------------
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000009a1', format('select %s', f)), 'denied',
  format('authenticated cannot call %s', split_part(f, '(', 1)))
from unnest(array[
  $$public.mark_recording_uploaded('99900000-0000-0000-0000-000000000001')$$,
  $$public.mark_recording_failed('99900000-0000-0000-0000-000000000001', 'x')$$,
  $$public.soft_delete_recording('99900000-0000-0000-0000-000000000001')$$,
  $$public.consume_rate_limit('00000000-0000-0000-0000-0000000009a1', 'x', 1, 60)$$,
  $$count(*) from public.claim_storage_cleanup(1)$$,
  $$public.run_recording_maintenance()$$
]) as f;
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000009a1', $$select count(*) from public.rate_limit_counters$$), 'denied',
  'clients cannot read or reset rate-limit counters');

-- Limits -------------------------------------------------------------------------------------
update workspaces set storage_quota_bytes = 1000 where id = 'a9000000-0000-0000-0000-000000000000';
select lives_ok($$select pg_temp.rec(1, 'd9000000-0000-0000-0000-000000000001', 600)$$, 'an upload within the quota is accepted');
select throws_ok($$select pg_temp.rec(2, 'd9000000-0000-0000-0000-000000000001', 401)$$, 'P0001', 'Workspace storage quota exceeded.',
  'an upload that would exceed the workspace quota is rejected');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000009b2', $$
  insert into recordings (id, workspace_id, recruiter_call_id, uploaded_by, file_name, storage_path, mime_type, file_size, consent_confirmed_at)
  values ('99900000-0000-0000-0000-000000000003', 'a9000000-0000-0000-0000-000000000000', 'd9000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-0000000009b2', 'x.mp3',
          'a9000000-0000-0000-0000-000000000000/d9000000-0000-0000-0000-000000000001/99900000-0000-0000-0000-000000000003.mp3',
          'audio/mpeg', 500, now()) returning 1$$),
  'error:P0001', 'the quota also applies to inserts made directly by clients');
select public.mark_recording_failed('99900000-0000-0000-0000-000000000001', 'Not audio.');
select lives_ok($$select pg_temp.rec(4, 'd9000000-0000-0000-0000-000000000001', 1000)$$,
  'failed recordings no longer count against the quota');
select is(pg_temp.queued(1, 'failed_validation'), 1, 'a failed validation queues the object for removal');

update workspaces set storage_quota_bytes = 2147483648 where id = 'a9000000-0000-0000-0000-000000000000';
select pg_temp.rec(n, 'd9000000-0000-0000-0000-000000000002', 10) from generate_series(10, 19) n;
select throws_ok($$select pg_temp.rec(20, 'd9000000-0000-0000-0000-000000000002', 10)$$, 'P0001', 'A call can have at most 10 recordings.',
  'a call can hold at most 10 live recordings');
select throws_ok($$insert into recordings (id, workspace_id, recruiter_call_id, file_name, storage_path, mime_type, file_size, consent_confirmed_at)
  values ('99900000-0000-0000-0000-000000000021', 'a9000000-0000-0000-0000-000000000000', 'd9000000-0000-0000-0000-000000000001', 'big.mp3',
          'a9000000-0000-0000-0000-000000000000/d9000000-0000-0000-0000-000000000001/99900000-0000-0000-0000-000000000021.mp3',
          'audio/mpeg', 104857601, now())$$,
  '23514', null, 'the database rejects files above the 100 MiB hard limit');

-- Lifecycle ------------------------------------------------------------------------------------
update workspaces set recording_retention_days = 30 where id = 'a9000000-0000-0000-0000-000000000000';
select is(
  (select (delete_after - uploaded_at)::text from public.mark_recording_uploaded('99900000-0000-0000-0000-000000000004')),
  '30 days', 'completing an upload sets the retention deadline from the workspace setting');
select throws_ok($$select public.mark_recording_uploaded('99900000-0000-0000-0000-000000000004')$$, 'P0001', null,
  'a recording can be completed only once');
select throws_ok($$select public.mark_recording_failed('99900000-0000-0000-0000-000000000004', 'x')$$, 'P0001', null,
  'an uploaded recording cannot be marked failed');
select throws_ok($$update recordings set status = 'pending' where id = '99900000-0000-0000-0000-000000000004'$$, 'P0001', null,
  'the status cannot move backwards');
select is((select uploaded_recording_count(c) from recruiter_calls c where c.id = 'd9000000-0000-0000-0000-000000000001'), 1,
  'the call recording count includes only uploaded recordings');

update workspaces set recording_retention_days = 90 where id = 'a9000000-0000-0000-0000-000000000000';
select is((select (delete_after - uploaded_at)::text from recordings where id = '99900000-0000-0000-0000-000000000004'), '90 days',
  'changing the retention setting updates existing recordings');
update workspaces set recording_retention_days = null where id = 'a9000000-0000-0000-0000-000000000000';
select is((select delete_after from recordings where id = '99900000-0000-0000-0000-000000000004'), null,
  '"keep until deleted" clears the deadline');

select is((select status || '|' || (deleted_at is not null) from public.soft_delete_recording('99900000-0000-0000-0000-000000000004')),
  'deleted|true', 'soft delete marks the recording deleted');
select is(pg_temp.queued(4, 'user_delete'), 1, 'soft delete queues the object for removal');
select throws_ok($$select public.soft_delete_recording('99900000-0000-0000-0000-000000000004')$$, 'P0002', null,
  'deleting twice reports not found');
select throws_ok($$update recordings set status = 'uploaded', deleted_at = null where id = '99900000-0000-0000-0000-000000000004'$$, 'P0001', null,
  'deleted recordings cannot be restored');
delete from recordings where id = '99900000-0000-0000-0000-000000000004';
select is(pg_temp.queued(4, 'cascade'), 0, 'hard-deleting a tombstone does not queue the object again');

-- Rate limits ---------------------------------------------------------------------------------------
select is(
  array[public.consume_rate_limit('00000000-0000-0000-0000-0000000009a1', 'test', 2, 3600),
        public.consume_rate_limit('00000000-0000-0000-0000-0000000009a1', 'test', 2, 3600),
        public.consume_rate_limit('00000000-0000-0000-0000-0000000009a1', 'test', 2, 3600)],
  array[true, true, false], 'rate limits allow `limit` hits per window');
select is(public.consume_rate_limit('00000000-0000-0000-0000-0000000009b2', 'test', 2, 3600), true,
  'rate limits are per user');

-- Maintenance ------------------------------------------------------------------------------------------
delete from storage_cleanup_queue;
-- 10: abandoned pending upload; 11: uploaded past retention; 12: old failed tombstone; 13: fresh pending.
update recordings set created_at = now() - interval '25 hours' where id = '99900000-0000-0000-0000-000000000010';
select public.mark_recording_uploaded('99900000-0000-0000-0000-000000000011');
update recordings set delete_after = now() - interval '1 minute' where id = '99900000-0000-0000-0000-000000000011';
select public.mark_recording_failed('99900000-0000-0000-0000-000000000012', 'x');
alter table recordings disable trigger set_updated_at;
update recordings set updated_at = now() - interval '31 days' where id = '99900000-0000-0000-0000-000000000012';
alter table recordings enable trigger set_updated_at;
-- An orphaned object (no live recording) and the object of a live pending upload.
insert into storage.objects (bucket_id, name, created_at) values
  ('recordings', 'a9000000-0000-0000-0000-000000000000/d9000000-0000-0000-0000-000000000002/orphan.mp3', now() - interval '2 hours'),
  ('recordings', 'a9000000-0000-0000-0000-000000000000/d9000000-0000-0000-0000-000000000002/99900000-0000-0000-0000-000000000013.mp3', now() - interval '2 hours');
delete from storage_cleanup_queue;

select is(public.run_recording_maintenance(),
  '{"abandoned": 1, "expired": 1, "orphansQueued": 1, "tombstonesPurged": 1}'::jsonb,
  'maintenance reports what it changed');
select is((select status || '|' || failure_reason from recordings where id = '99900000-0000-0000-0000-000000000010'),
  'failed|The upload was not completed.', 'abandoned uploads are marked failed');
select is(pg_temp.queued(10, 'abandoned'), 1, 'abandoned uploads queue any partial object');
select is((select status from recordings where id = '99900000-0000-0000-0000-000000000011'), 'deleted',
  'recordings past their retention deadline are deleted');
select is(pg_temp.queued(11, 'retention'), 1, 'expired recordings queue their object');
select is((select count(*)::int from recordings where id = '99900000-0000-0000-0000-000000000012'), 0, 'old tombstones are purged');
select is(
  (select array_agg(split_part(storage_path, '/', 3) order by storage_path) from storage_cleanup_queue where reason = 'abandoned'),
  array['99900000-0000-0000-0000-000000000010.mp3', 'orphan.mp3'],
  'old orphaned objects are queued; objects of live uploads and fresh objects are not');
select is((public.run_recording_maintenance() ->> 'orphansQueued')::int, 0, 'orphans are queued only once');

select is((select count(*)::int from public.claim_storage_cleanup(2)), 2, 'workers claim a batch of cleanup entries');
select is((select count(*)::int from public.claim_storage_cleanup(100)),
  (select count(*)::int from storage_cleanup_queue where completed_at is null) - 2,
  'claimed entries are not handed to another worker');
update storage_cleanup_queue set locked_until = now() - interval '1 second';
select is((select min(attempts) from public.claim_storage_cleanup(100)), 2, 'expired claims are retried and attempts are counted');

select * from finish();
rollback;
