-- Transactional application functions (save_opportunity, save_recruiter_call),
-- executed as the real authenticated role so RLS and grants apply.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(26);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000008a1', 'svc-owner@example.com'),
  ('00000000-0000-0000-0000-0000000008b2', 'svc-viewer@example.com'),
  ('00000000-0000-0000-0000-0000000008c3', 'svc-other@example.com');
insert into workspaces (id, name, owner_id) values
  ('a8000000-0000-0000-0000-000000000000', 'Services', '00000000-0000-0000-0000-0000000008a1'),
  ('a8000000-0000-0000-0000-0000000000ff', 'Other', '00000000-0000-0000-0000-0000000008c3');
insert into workspace_members (workspace_id, user_id, role) values
  ('a8000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000008b2', 'viewer');
insert into companies (id, workspace_id, name) values
  ('c8000000-0000-0000-0000-0000000000ff', 'a8000000-0000-0000-0000-0000000000ff', 'Foreign Co');
insert into recruiters (id, workspace_id, name) values
  ('e8000000-0000-0000-0000-0000000000ff', 'a8000000-0000-0000-0000-0000000000ff', 'Foreign Recruiter');

-- Runs a statement as a user; keeps successful effects. Returns the scalar result,
-- or 'denied' / 'error:<sqlstate>'.
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

create temp table result (key text primary key, value jsonb);

-- Composite create: new company + new opportunity + new recruiter + call + follow-up.
insert into result
select 'create', pg_temp.as_user('00000000-0000-0000-0000-0000000008a1', $$
  select public.save_recruiter_call('a8000000-0000-0000-0000-000000000000', null, '{
    "opportunity": {"create": {"company_name": "Skyline Robotics", "title": "Cloud DevOps Engineer",
                               "work_mode": "hybrid", "employment_type": "full_time",
                               "comp_min": 120000, "comp_max": 150000, "comp_period": "year",
                               "required_skills": ["AWS", "Terraform"]}},
    "recruiter": {"create": {"name": "Casey Nguyen", "email": "casey@example.com"}},
    "call": {"call_at": "2026-10-20T15:00:00Z", "duration_minutes": 30, "interest_level": 7,
             "technical_topics": ["AWS"], "candidate_questions": [{"question": "Team size?", "answer": "8"}],
             "notes": "Fictional notes"},
    "follow_up": {"title": "Send thank-you", "due_date": "2026-10-27"}
  }')::text$$)::jsonb;

select ok((select value ? 'call_id' from result where key = 'create'), 'composite create returns the new ids');
select is((select count(*)::int from companies where workspace_id = 'a8000000-0000-0000-0000-000000000000' and name = 'Skyline Robotics'),
  1, 'the company was created');
select is(
  (select o.stage || '|' || o.title || '|' || coalesce(o.recruiter_id::text, 'none') from opportunities o
    where o.id = ((select value ->> 'opportunity_id' from result where key = 'create'))::uuid),
  'recruiter_screen|Cloud DevOps Engineer|' || (select value ->> 'recruiter_id' from result where key = 'create'),
  'a new opportunity from a call starts at recruiter screen and is linked to the recruiter');
select is(
  (select r.company_id from recruiters r where r.id = ((select value ->> 'recruiter_id' from result where key = 'create'))::uuid),
  ((select value ->> 'company_id' from result where key = 'create'))::uuid,
  'the new recruiter belongs to the opportunity''s company');
select is(
  (select c.interest_level || '|' || jsonb_array_length(c.candidate_questions) || '|' || c.recruiter_advice || '|' || (c.created_by is not null)
     from recruiter_calls c where c.id = ((select value ->> 'call_id' from result where key = 'create'))::uuid),
  '7|1||true',
  'the call stores fields, defaults omitted ones and records the creator');
select is(
  (select f.title || '|' || f.due_date from follow_up_tasks f where f.id = ((select value ->> 'follow_up_id' from result where key = 'create'))::uuid),
  'Send thank-you|2026-10-27',
  'the follow-up was created and linked to the call');

-- Find-or-create reuses an existing company (case-insensitive).
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000008a1', $$
  select public.save_opportunity('a8000000-0000-0000-0000-000000000000', null,
    '{"opportunity": {"company_name": "  skyline ROBOTICS ", "title": "SRE", "work_mode": "remote", "employment_type": "contract"}}')::text$$) is not null,
  true, 'save_opportunity creates an opportunity');
select is((select count(*)::int from companies where workspace_id = 'a8000000-0000-0000-0000-000000000000'), 1,
  'company names are matched case-insensitively and trimmed (no duplicate)');
select is((select stage from opportunities where title = 'SRE'), 'new', 'opportunities created directly default to the new stage');

-- Partial update keeps untouched fields.
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000008a1', format($$
  select (public.save_recruiter_call('a8000000-0000-0000-0000-000000000000', %L, '{"call": {"notes": "Updated notes"}}') ->> 'call_id')$$,
  (select value ->> 'call_id' from result where key = 'create'))),
  (select value ->> 'call_id' from result where key = 'create'),
  'a partial call update succeeds');
select is(
  (select c.notes || '|' || c.interest_level || '|' || array_to_string(c.technical_topics, ',') || '|' || coalesce(c.recruiter_id::text, 'none')
     from recruiter_calls c where c.id = ((select value ->> 'call_id' from result where key = 'create'))::uuid),
  'Updated notes|7|AWS|' || (select value ->> 'recruiter_id' from result where key = 'create'),
  'fields not in the patch (interest, topics, recruiter) are unchanged');
select is((select count(*)::int from follow_up_tasks where recruiter_call_id = ((select value ->> 'call_id' from result where key = 'create'))::uuid),
  1, 'omitting follow_up leaves the follow-up untouched');

-- Editing the linked opportunity and recruiter through the call.
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000008a1', format($$
  select (public.save_recruiter_call('a8000000-0000-0000-0000-000000000000', %L,
    jsonb_build_object(
      'opportunity', jsonb_build_object('id', %L::uuid, 'update', '{"location": "Denver, CO"}'::jsonb),
      'recruiter', jsonb_build_object('id', %L::uuid, 'update', '{"phone": "(303) 555-0100"}'::jsonb),
      'follow_up', '{"title": "Email availability", "due_date": "2026-10-29"}'::jsonb)) ->> 'call_id')$$,
  (select value ->> 'call_id' from result where key = 'create'),
  (select value ->> 'opportunity_id' from result where key = 'create'),
  (select value ->> 'recruiter_id' from result where key = 'create'))) is not null,
  true, 'a call update can edit the linked opportunity and recruiter');
select is((select location || '|' || title from opportunities where id = ((select value ->> 'opportunity_id' from result where key = 'create'))::uuid),
  'Denver, CO|Cloud DevOps Engineer', 'opportunity edits are partial');
select is((select phone || '|' || name from recruiters where id = ((select value ->> 'recruiter_id' from result where key = 'create'))::uuid),
  '(303) 555-0100|Casey Nguyen', 'recruiter edits are partial');
select is((select title || '|' || due_date || '|' || (completed_at is null) from follow_up_tasks
           where recruiter_call_id = ((select value ->> 'call_id' from result where key = 'create'))::uuid),
  'Email availability|2026-10-29|true', 'the follow-up is updated in place');

update follow_up_tasks set completed_at = now() where recruiter_call_id = ((select value ->> 'call_id' from result where key = 'create'))::uuid;
select pg_temp.as_user('00000000-0000-0000-0000-0000000008a1', format($$
  select public.save_recruiter_call('a8000000-0000-0000-0000-000000000000', %L, '{"follow_up": {"title": "Renamed", "due_date": "2026-10-30"}}')::text$$,
  (select value ->> 'call_id' from result where key = 'create')));
select ok((select completed_at is not null from follow_up_tasks where recruiter_call_id = ((select value ->> 'call_id' from result where key = 'create'))::uuid),
  'editing a follow-up preserves its completion');

select pg_temp.as_user('00000000-0000-0000-0000-0000000008a1', format($$
  select public.save_recruiter_call('a8000000-0000-0000-0000-000000000000', %L, '{"follow_up": null}')::text$$,
  (select value ->> 'call_id' from result where key = 'create')));
select is((select count(*)::int from follow_up_tasks where recruiter_call_id = ((select value ->> 'call_id' from result where key = 'create'))::uuid),
  0, 'follow_up null removes the call''s follow-up');

-- Atomicity: a failure late in the transaction leaves nothing behind.
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000008a1', $$
  select public.save_recruiter_call('a8000000-0000-0000-0000-000000000000', null, '{
    "opportunity": {"create": {"company_name": "Ghost Corp", "title": "Never saved", "work_mode": "remote", "employment_type": "full_time"}},
    "recruiter": {"create": {"name": "Ghost Recruiter"}},
    "call": {"call_at": "2026-10-20T15:00:00Z", "duration_minutes": 30, "interest_level": 99}
  }')::text$$),
  'error:23514', 'an invalid call (interest 99) is rejected');
select is(
  (select count(*)::int from companies where name = 'Ghost Corp')
  + (select count(*)::int from opportunities where title = 'Never saved')
  + (select count(*)::int from recruiters where name = 'Ghost Recruiter'),
  0, 'the failed save rolled back the company, opportunity and recruiter it had created');

-- Cross-workspace references and permissions.
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000008a1', $$
  select public.save_recruiter_call('a8000000-0000-0000-0000-000000000000', null, '{
    "opportunity": {"create": {"company_name": "Local Co", "title": "X", "work_mode": "remote", "employment_type": "full_time"}},
    "recruiter": {"id": "e8000000-0000-0000-0000-0000000000ff"},
    "call": {"call_at": "2026-10-20T15:00:00Z", "duration_minutes": 30, "interest_level": 5}
  }')::text$$),
  'error:P0002', 'a recruiter from another workspace is treated as not found');
select is((select count(*)::int from companies where name = 'Local Co'), 0,
  'and nothing from that attempt was kept');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000008a1', $$
  select public.save_opportunity('a8000000-0000-0000-0000-000000000000', null,
    '{"opportunity": {"company_id": "c8000000-0000-0000-0000-0000000000ff", "title": "X", "work_mode": "remote", "employment_type": "full_time"}}')::text$$),
  'error:23503', 'an opportunity cannot use another workspace''s company');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000008b2', $$
  select public.save_opportunity('a8000000-0000-0000-0000-000000000000', null,
    '{"opportunity": {"company_name": "Viewer Co", "title": "X", "work_mode": "remote", "employment_type": "full_time"}}')::text$$),
  'denied', 'viewers cannot save through the functions (RLS applies)');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000008c3', format($$
  select public.save_recruiter_call('a8000000-0000-0000-0000-000000000000', %L, '{"call": {"notes": "hijack"}}')::text$$,
  (select value ->> 'call_id' from result where key = 'create'))),
  'error:P0002', 'non-members cannot see or edit the call');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000008a1', $$
  select public.save_recruiter_call('a8000000-0000-0000-0000-000000000000', null, '{"call": {}}')::text$$),
  'error:22023', 'creating a call requires an opportunity');

select * from finish();
rollback;
