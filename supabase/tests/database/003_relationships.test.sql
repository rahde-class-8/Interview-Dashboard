-- Relationships: cross-workspace links are impossible, unique constraints,
-- and explicit restrict / set-null / cascade deletion behavior.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(26);

-- Fixtures: two users, one workspace each (W1, W2), a small graph in each.
insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'w1-owner@example.com'),
  ('20000000-0000-0000-0000-000000000002', 'w2-owner@example.com');
insert into workspaces (id, name, owner_id) values
  ('a1000000-0000-0000-0000-000000000000', 'W1', '10000000-0000-0000-0000-000000000001'),
  ('a2000000-0000-0000-0000-000000000000', 'W2', '20000000-0000-0000-0000-000000000002');

insert into companies (id, workspace_id, name) values
  ('c1000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'Northwind'),
  ('c2000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000000', 'Lumen');
insert into recruiters (id, workspace_id, company_id, name) values
  ('e1000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000000', 'Dana'),
  ('e2000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000000', 'c2000000-0000-0000-0000-000000000000', 'Marcus');
insert into opportunities (id, workspace_id, company_id, recruiter_id, title, work_mode, employment_type) values
  ('01000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000000', 'e1000000-0000-0000-0000-000000000000', 'AWS Cloud Engineer', 'hybrid', 'full_time'),
  ('01b00000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000000', null, 'Solutions Architect', 'remote', 'full_time'),
  ('02000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000000', 'c2000000-0000-0000-0000-000000000000', 'e2000000-0000-0000-0000-000000000000', 'DevOps Engineer', 'remote', 'contract');
insert into recruiter_calls (id, workspace_id, opportunity_id, recruiter_id, call_at, duration_minutes, interest_level) values
  ('d1000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', '01000000-0000-0000-0000-000000000000', 'e1000000-0000-0000-0000-000000000000', now(), 42, 8),
  ('d2000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000000', '02000000-0000-0000-0000-000000000000', 'e2000000-0000-0000-0000-000000000000', now(), 25, 6);
insert into shared_notes (id, workspace_id, opportunity_id, title) values
  ('f1000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', '01000000-0000-0000-0000-000000000000', 'Prep'),
  ('f2000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000000', null, 'Strategy');

-- Cross-workspace references are rejected (W1 rows pointing at W2 records) ----
select throws_ok($$insert into recruiters (workspace_id, company_id, name)
  values ('a1000000-0000-0000-0000-000000000000', 'c2000000-0000-0000-0000-000000000000', 'x')$$,
  '23503', null, 'recruiter cannot reference another workspace''s company');
select throws_ok($$insert into opportunities (workspace_id, company_id, title, work_mode, employment_type)
  values ('a1000000-0000-0000-0000-000000000000', 'c2000000-0000-0000-0000-000000000000', 'x', 'remote', 'full_time')$$,
  '23503', null, 'opportunity cannot reference another workspace''s company');
select throws_ok($$insert into opportunities (workspace_id, company_id, recruiter_id, title, work_mode, employment_type)
  values ('a1000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-000000000000', 'e2000000-0000-0000-0000-000000000000', 'x', 'remote', 'full_time')$$,
  '23503', null, 'opportunity cannot reference another workspace''s recruiter');
select throws_ok($$insert into recruiter_calls (workspace_id, opportunity_id, call_at, duration_minutes, interest_level)
  values ('a1000000-0000-0000-0000-000000000000', '02000000-0000-0000-0000-000000000000', now(), 10, 5)$$,
  '23503', null, 'call cannot reference another workspace''s opportunity');
select throws_ok($$insert into recruiter_calls (workspace_id, opportunity_id, recruiter_id, call_at, duration_minutes, interest_level)
  values ('a1000000-0000-0000-0000-000000000000', '01000000-0000-0000-0000-000000000000', 'e2000000-0000-0000-0000-000000000000', now(), 10, 5)$$,
  '23503', null, 'call cannot reference another workspace''s recruiter');
select throws_ok($$insert into recordings (id, workspace_id, recruiter_call_id, file_name, storage_path, mime_type, file_size, consent_confirmed_at)
  values ('99000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'd2000000-0000-0000-0000-000000000000', 'a.mp3',
          'a1000000-0000-0000-0000-000000000000/d2000000-0000-0000-0000-000000000000/99000000-0000-0000-0000-000000000001.mp3', 'audio/mpeg', 10, now())$$,
  '23503', null, 'recording cannot reference another workspace''s call');
select throws_ok($$insert into interviews (workspace_id, opportunity_id, title, stage, scheduled_at, duration_minutes, format)
  values ('a1000000-0000-0000-0000-000000000000', '02000000-0000-0000-0000-000000000000', 'x', 'technical', now(), 60, 'video')$$,
  '23503', null, 'interview cannot reference another workspace''s opportunity');
select throws_ok($$insert into questions (workspace_id, company_id, type, topic, difficulty, question)
  values ('a1000000-0000-0000-0000-000000000000', 'c2000000-0000-0000-0000-000000000000', 'technical', 'AWS', 'easy', 'q?')$$,
  '23503', null, 'question cannot reference another workspace''s company');
select throws_ok($$insert into preparation_tasks (workspace_id, opportunity_id, title, category)
  values ('a1000000-0000-0000-0000-000000000000', '02000000-0000-0000-0000-000000000000', 'x', 'technical')$$,
  '23503', null, 'preparation task cannot reference another workspace''s opportunity');
select throws_ok($$insert into follow_up_tasks (workspace_id, opportunity_id, title, due_date)
  values ('a1000000-0000-0000-0000-000000000000', '02000000-0000-0000-0000-000000000000', 'x', current_date)$$,
  '23503', null, 'follow-up cannot reference another workspace''s opportunity');
select throws_ok($$insert into follow_up_tasks (workspace_id, opportunity_id, recruiter_call_id, title, due_date)
  values ('a1000000-0000-0000-0000-000000000000', '01000000-0000-0000-0000-000000000000', 'd2000000-0000-0000-0000-000000000000', 'x', current_date)$$,
  null, 'follow-up cannot reference another workspace''s call');
select throws_ok($$insert into shared_notes (workspace_id, opportunity_id, title)
  values ('a1000000-0000-0000-0000-000000000000', '02000000-0000-0000-0000-000000000000', 'x')$$,
  '23503', null, 'note cannot reference another workspace''s opportunity');
select throws_ok($$insert into comments (workspace_id, note_id, body)
  values ('a1000000-0000-0000-0000-000000000000', 'f2000000-0000-0000-0000-000000000000', 'x')$$,
  '23503', null, 'comment cannot reference another workspace''s note');
select throws_ok($$update opportunities set workspace_id = 'a2000000-0000-0000-0000-000000000000'
  where id = '01000000-0000-0000-0000-000000000000'$$,
  '23503', null, 'a record cannot be moved into another workspace while linked to its parents');

-- Unique constraints ------------------------------------------------------------
select throws_ok($$insert into companies (workspace_id, name) values ('a1000000-0000-0000-0000-000000000000', 'NORTHWIND')$$,
  '23505', null, 'company names are unique per workspace, case-insensitively');
select lives_ok($$insert into companies (workspace_id, name) values ('a2000000-0000-0000-0000-000000000000', 'Northwind')$$,
  'the same company name is allowed in another workspace');

-- Follow-up rules ----------------------------------------------------------------
insert into follow_up_tasks (id, workspace_id, opportunity_id, recruiter_call_id, title, due_date) values
  ('b1000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000000', '01000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000000', 'Send thank-you', current_date + 1);
select throws_ok($$insert into follow_up_tasks (workspace_id, opportunity_id, recruiter_call_id, title, due_date)
  values ('a1000000-0000-0000-0000-000000000000', '01000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000000', 'dup', current_date)$$,
  '23505', null, 'a call has at most one follow-up');
select throws_ok($$update follow_up_tasks set opportunity_id = '01b00000-0000-0000-0000-000000000000'
  where id = 'b1000000-0000-0000-0000-000000000000'$$,
  '23514', null, 'a call''s follow-up must belong to the call''s opportunity');
update recruiter_calls set opportunity_id = '01b00000-0000-0000-0000-000000000000' where id = 'd1000000-0000-0000-0000-000000000000';
select is((select opportunity_id from follow_up_tasks where id = 'b1000000-0000-0000-0000-000000000000'),
  '01b00000-0000-0000-0000-000000000000'::uuid, 'moving a call to another opportunity moves its follow-up');
update recruiter_calls set opportunity_id = '01000000-0000-0000-0000-000000000000' where id = 'd1000000-0000-0000-0000-000000000000';

-- Deletion behavior ---------------------------------------------------------------
select throws_ok($$delete from companies where id = 'c1000000-0000-0000-0000-000000000000'$$,
  '23503', null, 'a company referenced by opportunities cannot be deleted (restrict)');

delete from recruiters where id = 'e1000000-0000-0000-0000-000000000000';
select ok(
  (select recruiter_id is null from opportunities where id = '01000000-0000-0000-0000-000000000000')
  and (select recruiter_id is null from recruiter_calls where id = 'd1000000-0000-0000-0000-000000000000'),
  'deleting a recruiter clears it on opportunities and calls (set null)'
);
select is((select workspace_id from opportunities where id = '01000000-0000-0000-0000-000000000000'),
  'a1000000-0000-0000-0000-000000000000'::uuid, 'set-null keeps the workspace_id of the child row intact');

insert into interviews (workspace_id, opportunity_id, title, stage, scheduled_at, duration_minutes, format)
  values ('a1000000-0000-0000-0000-000000000000', '01000000-0000-0000-0000-000000000000', 'Tech', 'technical', now() + interval '2 days', 60, 'video');
insert into preparation_tasks (workspace_id, opportunity_id, title, category)
  values ('a1000000-0000-0000-0000-000000000000', '01000000-0000-0000-0000-000000000000', 'Review Terraform', 'technical');
insert into comments (workspace_id, note_id, body)
  values ('a1000000-0000-0000-0000-000000000000', 'f1000000-0000-0000-0000-000000000000', 'Nice');

delete from opportunities where id = '01000000-0000-0000-0000-000000000000';
select is(
  (select count(*)::int from recruiter_calls where opportunity_id = '01000000-0000-0000-0000-000000000000')
  + (select count(*)::int from interviews where opportunity_id = '01000000-0000-0000-0000-000000000000')
  + (select count(*)::int from preparation_tasks where opportunity_id = '01000000-0000-0000-0000-000000000000')
  + (select count(*)::int from follow_up_tasks where opportunity_id = '01000000-0000-0000-0000-000000000000'),
  0,
  'deleting an opportunity cascades to calls, interviews, preparation and follow-up tasks'
);
select is((select opportunity_id from shared_notes where id = 'f1000000-0000-0000-0000-000000000000'),
  null, 'deleting an opportunity unlinks related shared notes (set null)');

delete from shared_notes where id = 'f1000000-0000-0000-0000-000000000000';
select is((select count(*)::int from comments where note_id = 'f1000000-0000-0000-0000-000000000000'),
  0, 'deleting a note cascades to its comments');

delete from workspaces where id = 'a1000000-0000-0000-0000-000000000000';
select is(
  (select count(*)::int from companies where workspace_id = 'a1000000-0000-0000-0000-000000000000')
  + (select count(*)::int from recruiters where workspace_id = 'a1000000-0000-0000-0000-000000000000')
  + (select count(*)::int from opportunities where workspace_id = 'a1000000-0000-0000-0000-000000000000')
  + (select count(*)::int from shared_notes where workspace_id = 'a1000000-0000-0000-0000-000000000000'),
  0,
  'deleting a workspace removes all of its records (company restrict does not block it)'
);

select * from finish();
rollback;
