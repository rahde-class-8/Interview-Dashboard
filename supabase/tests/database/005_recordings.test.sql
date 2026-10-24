-- Recording metadata rules and the storage cleanup queue.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

insert into auth.users (id, email) values ('10000000-0000-0000-0000-0000000000d5', 'recordings@example.com');
insert into workspaces (id, name, owner_id) values
  ('a5000000-0000-0000-0000-000000000000', 'W5', '10000000-0000-0000-0000-0000000000d5');
insert into companies (id, workspace_id, name) values
  ('c5000000-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000000', 'Harborline');
insert into opportunities (id, workspace_id, company_id, title, work_mode, employment_type) values
  ('05000000-0000-0000-0000-000000000000', 'a5000000-0000-0000-0000-000000000000', 'c5000000-0000-0000-0000-000000000000', 'Platform Engineer', 'hybrid', 'full_time');
insert into recruiter_calls (id, workspace_id, opportunity_id, call_at, duration_minutes, interest_level) values
  ('d5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000000', '05000000-0000-0000-0000-000000000000', now(), 30, 7),
  ('d5000000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000000', '05000000-0000-0000-0000-000000000000', now(), 15, 8);

-- Path / format rules -------------------------------------------------------------
select lives_ok($$insert into recordings (id, workspace_id, recruiter_call_id, uploaded_by, file_name, storage_path, mime_type, file_size, consent_confirmed_at)
  values ('99500000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000000', 'd5000000-0000-0000-0000-000000000001',
          '10000000-0000-0000-0000-0000000000d5', 'harborline call.m4a',
          'a5000000-0000-0000-0000-000000000000/d5000000-0000-0000-0000-000000000001/99500000-0000-0000-0000-000000000001.m4a',
          'audio/mp4', 1048576, now())$$,
  'a recording with a server-shaped path is accepted');
select is((select status from recordings where id = '99500000-0000-0000-0000-000000000001'), 'pending',
  'new recordings start as pending uploads');
select throws_ok($$insert into recordings (id, workspace_id, recruiter_call_id, file_name, storage_path, mime_type, file_size, consent_confirmed_at)
  values ('99500000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-000000000000', 'd5000000-0000-0000-0000-000000000001', 'x.mp3',
          'public/x.mp3', 'audio/mpeg', 10, now())$$,
  '23514', null, 'storage paths must follow {workspace}/{call}/{id}.{ext}');
select throws_ok($$insert into recordings (id, workspace_id, recruiter_call_id, file_name, storage_path, mime_type, file_size, consent_confirmed_at)
  values ('99500000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000000', 'd5000000-0000-0000-0000-000000000001', 'x.ogg',
          'a5000000-0000-0000-0000-000000000000/d5000000-0000-0000-0000-000000000001/99500000-0000-0000-0000-000000000003.ogg', 'audio/ogg', 10, now())$$,
  '23514', null, 'only MP3, M4A and WAV are allowed');
select throws_ok($$insert into recordings (id, workspace_id, recruiter_call_id, file_name, storage_path, mime_type, file_size)
  values ('99500000-0000-0000-0000-000000000004', 'a5000000-0000-0000-0000-000000000000', 'd5000000-0000-0000-0000-000000000001', 'x.wav',
          'a5000000-0000-0000-0000-000000000000/d5000000-0000-0000-0000-000000000001/99500000-0000-0000-0000-000000000004.wav', 'audio/wav', 10)$$,
  '23502', null, 'consent confirmation is required');
select throws_ok($$update recordings set status = 'uploaded' where id = '99500000-0000-0000-0000-000000000001'$$,
  '23514', null, 'uploaded recordings must have uploaded_at');
select lives_ok($$update recordings set status = 'uploaded', uploaded_at = now(), duration_seconds = 1800
  where id = '99500000-0000-0000-0000-000000000001'$$,
  'a verified upload can be marked uploaded');
select throws_ok($$update recordings set status = 'deleted' where id = '99500000-0000-0000-0000-000000000001'$$,
  '23514', null, 'soft delete requires deleted_at');

-- Cleanup queue -----------------------------------------------------------------------
update recordings set status = 'deleted', deleted_at = now() where id = '99500000-0000-0000-0000-000000000001';
select is(
  (select reason from storage_cleanup_queue
    where storage_path = 'a5000000-0000-0000-0000-000000000000/d5000000-0000-0000-0000-000000000001/99500000-0000-0000-0000-000000000001.m4a'),
  'user_delete',
  'soft-deleting a recording queues its object for purge'
);
delete from recordings where id = '99500000-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from storage_cleanup_queue
    where storage_path = 'a5000000-0000-0000-0000-000000000000/d5000000-0000-0000-0000-000000000001/99500000-0000-0000-0000-000000000001.m4a'),
  1,
  'removing an already soft-deleted row does not queue the object twice'
);

insert into recordings (id, workspace_id, recruiter_call_id, file_name, storage_path, mime_type, file_size, consent_confirmed_at) values
  ('99500000-0000-0000-0000-000000000011', 'a5000000-0000-0000-0000-000000000000', 'd5000000-0000-0000-0000-000000000001', 'a.mp3',
   'a5000000-0000-0000-0000-000000000000/d5000000-0000-0000-0000-000000000001/99500000-0000-0000-0000-000000000011.mp3', 'audio/mpeg', 10, now()),
  ('99500000-0000-0000-0000-000000000012', 'a5000000-0000-0000-0000-000000000000', 'd5000000-0000-0000-0000-000000000002', 'b.wav',
   'a5000000-0000-0000-0000-000000000000/d5000000-0000-0000-0000-000000000002/99500000-0000-0000-0000-000000000012.wav', 'audio/wav', 10, now()),
  ('99500000-0000-0000-0000-000000000013', 'a5000000-0000-0000-0000-000000000000', 'd5000000-0000-0000-0000-000000000002', 'c.mp3',
   'a5000000-0000-0000-0000-000000000000/d5000000-0000-0000-0000-000000000002/99500000-0000-0000-0000-000000000013.mp3', 'audio/mpeg', 10, now());

delete from recruiter_calls where id = 'd5000000-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from storage_cleanup_queue where reason = 'cascade' and storage_path like '%99500000-0000-0000-0000-000000000011.mp3'),
  1,
  'deleting a call queues its recordings'' objects'
);
select is((select count(*)::int from recordings where recruiter_call_id = 'd5000000-0000-0000-0000-000000000001'), 0,
  'deleting a call removes its recording rows');

delete from workspaces where id = 'a5000000-0000-0000-0000-000000000000';
select is(
  (select count(*)::int from storage_cleanup_queue where reason = 'cascade' and workspace_id = 'a5000000-0000-0000-0000-000000000000'),
  3,
  'deleting a workspace queues every remaining recording object'
);
select is((select count(*)::int from storage_cleanup_queue where workspace_id = 'a5000000-0000-0000-0000-000000000000' and completed_at is null), 4,
  'queue entries survive workspace deletion so objects can still be purged');

select * from finish();
rollback;
