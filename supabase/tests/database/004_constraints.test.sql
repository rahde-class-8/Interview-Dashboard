-- Column-level rules and maintenance triggers.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

insert into auth.users (id, email) values ('10000000-0000-0000-0000-0000000000c4', 'constraints@example.com');
insert into workspaces (id, name, owner_id) values
  ('a4000000-0000-0000-0000-000000000000', 'W4', '10000000-0000-0000-0000-0000000000c4');
insert into companies (id, workspace_id, name) values
  ('c4000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'Cobalt');
insert into opportunities (id, workspace_id, company_id, title, work_mode, employment_type) values
  ('04000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'c4000000-0000-0000-0000-000000000000', 'Cloud Infra', 'hybrid', 'full_time');

-- Opportunities -------------------------------------------------------------------
select throws_ok($$update opportunities set comp_min = 100, comp_max = 50, comp_period = 'year' where id = '04000000-0000-0000-0000-000000000000'$$,
  '23514', null, 'compensation max must be >= min');
select throws_ok($$update opportunities set comp_min = 100 where id = '04000000-0000-0000-0000-000000000000'$$,
  '23514', null, 'compensation is all-or-nothing');
select lives_ok($$update opportunities set comp_min = 160000, comp_max = 185000, comp_period = 'year' where id = '04000000-0000-0000-0000-000000000000'$$,
  'a complete compensation range is accepted');
select throws_ok($$update opportunities set stage = 'ghosted' where id = '04000000-0000-0000-0000-000000000000'$$,
  '23514', null, 'stage must be one of the six pipeline stages');
select throws_ok($$update opportunities set work_mode = 'mars' where id = '04000000-0000-0000-0000-000000000000'$$,
  '23514', null, 'work_mode is constrained');
select throws_ok($$update opportunities set title = '   ' where id = '04000000-0000-0000-0000-000000000000'$$,
  '23514', null, 'blank titles are rejected');
select throws_ok($$update opportunities set comp_currency = 'usd' where id = '04000000-0000-0000-0000-000000000000'$$,
  '23514', null, 'currency must be an ISO-4217 style code');

update opportunities set stage_changed_at = '2000-01-01', updated_at = '2000-01-01' where id = '04000000-0000-0000-0000-000000000000';
update opportunities set stage = 'offer' where id = '04000000-0000-0000-0000-000000000000';
select ok((select stage_changed_at > '2001-01-01' from opportunities where id = '04000000-0000-0000-0000-000000000000'),
  'changing stage stamps stage_changed_at');
select ok((select updated_at > '2001-01-01' from opportunities where id = '04000000-0000-0000-0000-000000000000'),
  'updates maintain updated_at');
update opportunities set stage_changed_at = '2000-01-01' where id = '04000000-0000-0000-0000-000000000000';
update opportunities set title = 'Cloud Infrastructure Engineer' where id = '04000000-0000-0000-0000-000000000000';
select is((select stage_changed_at from opportunities where id = '04000000-0000-0000-0000-000000000000'),
  '2000-01-01'::timestamptz, 'non-stage edits leave stage_changed_at alone');

-- Recruiter calls --------------------------------------------------------------------
select throws_ok($$insert into recruiter_calls (workspace_id, opportunity_id, call_at, duration_minutes, interest_level)
  values ('a4000000-0000-0000-0000-000000000000', '04000000-0000-0000-0000-000000000000', now(), 30, 11)$$,
  '23514', null, 'interest level is 1–10');
select throws_ok($$insert into recruiter_calls (workspace_id, opportunity_id, call_at, duration_minutes, interest_level)
  values ('a4000000-0000-0000-0000-000000000000', '04000000-0000-0000-0000-000000000000', now(), 0, 5)$$,
  '23514', null, 'duration is 1–600 minutes');
select lives_ok($$insert into recruiter_calls (workspace_id, opportunity_id, call_at, duration_minutes, interest_level, candidate_questions)
  values ('a4000000-0000-0000-0000-000000000000', '04000000-0000-0000-0000-000000000000', now(), 30, 7,
          '[{"question": "On-call?", "answer": "1 week in 6"}, {"question": "Remote?"}]')$$,
  'well-formed candidate questions are accepted');
select throws_ok($$insert into recruiter_calls (workspace_id, opportunity_id, call_at, duration_minutes, interest_level, candidate_questions)
  values ('a4000000-0000-0000-0000-000000000000', '04000000-0000-0000-0000-000000000000', now(), 30, 7, '{"question": "not an array"}')$$,
  '23514', null, 'candidate questions must be an array');
select throws_ok($$insert into recruiter_calls (workspace_id, opportunity_id, call_at, duration_minutes, interest_level, candidate_questions)
  values ('a4000000-0000-0000-0000-000000000000', '04000000-0000-0000-0000-000000000000', now(), 30, 7, '[{"question": ""}]')$$,
  '23514', null, 'candidate questions cannot be empty');
select throws_ok($$insert into recruiter_calls (workspace_id, opportunity_id, call_at, duration_minutes, interest_level, candidate_questions)
  values ('a4000000-0000-0000-0000-000000000000', '04000000-0000-0000-0000-000000000000', now(), 30, 7, '[{"question": "q", "extra": 1}]')$$,
  '23514', null, 'candidate questions reject unknown keys');

-- Tasks and interviews ----------------------------------------------------------------
select throws_ok($$insert into follow_up_tasks (workspace_id, opportunity_id, title)
  values ('a4000000-0000-0000-0000-000000000000', '04000000-0000-0000-0000-000000000000', 'No date')$$,
  '23502', null, 'follow-ups require a due date');
select throws_ok($$insert into preparation_tasks (workspace_id, opportunity_id, title, category)
  values ('a4000000-0000-0000-0000-000000000000', '04000000-0000-0000-0000-000000000000', 'x', 'astrology')$$,
  '23514', null, 'preparation category is constrained');
select throws_ok($$insert into interviews (workspace_id, opportunity_id, title, stage, scheduled_at, duration_minutes, format)
  values ('a4000000-0000-0000-0000-000000000000', '04000000-0000-0000-0000-000000000000', 'x', 'closed', now(), 60, 'video')$$,
  '23514', null, 'interviews cannot be in the new/closed stages');
select throws_ok($$insert into questions (workspace_id, type, topic, difficulty, question)
  values ('a4000000-0000-0000-0000-000000000000', 'trivia', 'AWS', 'easy', 'q')$$,
  '23514', null, 'question type is technical or behavioral');

-- Shared notes versioning -----------------------------------------------------------------
insert into shared_notes (id, workspace_id, title, body) values
  ('f4000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000000', 'Plan', 'v1');
update shared_notes set body = 'v2' where id = 'f4000000-0000-0000-0000-000000000000';
select is((select version from shared_notes where id = 'f4000000-0000-0000-0000-000000000000'), 2,
  'content edits increment the note version');
update shared_notes set version = 99, updated_by = '10000000-0000-0000-0000-0000000000c4' where id = 'f4000000-0000-0000-0000-000000000000';
select is((select version from shared_notes where id = 'f4000000-0000-0000-0000-000000000000'), 2,
  'version cannot be set directly and non-content edits keep it');

-- Activity events -----------------------------------------------------------------------------
select throws_ok($$insert into activity_events (workspace_id, action, entity_type) values ('a4000000-0000-0000-0000-000000000000', 'Opportunity Changed', 'opportunity')$$,
  '23514', null, 'activity action uses the entity.verb format');
select throws_ok($$insert into activity_events (workspace_id, action, entity_type, metadata) values ('a4000000-0000-0000-0000-000000000000', 'note.created', 'note', '[]')$$,
  '23514', null, 'activity metadata must be a JSON object');

select * from finish();
rollback;
