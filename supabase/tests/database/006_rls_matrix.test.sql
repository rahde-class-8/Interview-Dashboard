-- Role × table × operation matrix for workspace-owned domain records, plus
-- anonymous access. Each attempt runs as the real `authenticated` (or `anon`)
-- role with JWT claims, inside a subtransaction that is always rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(219);

-- Users: owner, editor, commenter, viewer of workspace W; outsider owns only W2.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'editor@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'commenter@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'viewer@example.com'),
  ('00000000-0000-0000-0000-00000000000e', 'outsider@example.com');
insert into workspaces (id, name, owner_id) values
  ('a6000000-0000-0000-0000-000000000000', 'W', '00000000-0000-0000-0000-00000000000a');
insert into workspace_members (workspace_id, user_id, role) values
  ('a6000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000b', 'editor'),
  ('a6000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000c', 'commenter'),
  ('a6000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000d', 'viewer');

-- Parent records and one target row per table (all in W).
insert into companies (id, workspace_id, name) values
  ('c6000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000000', 'Parent Co'),
  ('c6000000-0000-0000-0000-000000000002', 'a6000000-0000-0000-0000-000000000000', 'Target Co');
insert into recruiters (id, workspace_id, name) values
  ('e6000000-0000-0000-0000-000000000002', 'a6000000-0000-0000-0000-000000000000', 'Target Recruiter');
insert into opportunities (id, workspace_id, company_id, title, work_mode, employment_type) values
  ('06000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000000', 'c6000000-0000-0000-0000-000000000001', 'Parent Opp', 'remote', 'full_time'),
  ('06000000-0000-0000-0000-000000000002', 'a6000000-0000-0000-0000-000000000000', 'c6000000-0000-0000-0000-000000000001', 'Target Opp', 'remote', 'full_time');
insert into recruiter_calls (id, workspace_id, opportunity_id, call_at, duration_minutes, interest_level) values
  ('d6000000-0000-0000-0000-000000000002', 'a6000000-0000-0000-0000-000000000000', '06000000-0000-0000-0000-000000000001', now(), 30, 7);
insert into interviews (id, workspace_id, opportunity_id, title, stage, scheduled_at, duration_minutes, format) values
  ('16000000-0000-0000-0000-000000000002', 'a6000000-0000-0000-0000-000000000000', '06000000-0000-0000-0000-000000000001', 'Target', 'technical', now(), 60, 'video');
insert into questions (id, workspace_id, type, topic, difficulty, question) values
  ('26000000-0000-0000-0000-000000000002', 'a6000000-0000-0000-0000-000000000000', 'technical', 'AWS', 'easy', 'Target?');
insert into preparation_tasks (id, workspace_id, opportunity_id, title, category) values
  ('36000000-0000-0000-0000-000000000002', 'a6000000-0000-0000-0000-000000000000', '06000000-0000-0000-0000-000000000001', 'Target', 'technical');
insert into follow_up_tasks (id, workspace_id, opportunity_id, title, due_date) values
  ('46000000-0000-0000-0000-000000000002', 'a6000000-0000-0000-0000-000000000000', '06000000-0000-0000-0000-000000000001', 'Target', current_date);
insert into star_stories (id, workspace_id, title) values
  ('56000000-0000-0000-0000-000000000002', 'a6000000-0000-0000-0000-000000000000', 'Target');
insert into shared_notes (id, workspace_id, title) values
  ('f6000000-0000-0000-0000-000000000002', 'a6000000-0000-0000-0000-000000000000', 'Target');

-- Runs one statement as a user and reports 'rows:<n>', 'denied' or 'error:<sqlstate>'.
-- The subtransaction is always aborted, which also restores the role and undoes writes.
create function pg_temp.attempt(p_user uuid, p_sql text, p_kind text)
returns text
language plpgsql
as $$
declare
  n bigint;
begin
  begin
    if p_user is null then
      perform set_config('role', 'anon', true);
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    else
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims',
        json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    end if;
    if p_kind = 'count' then
      execute p_sql into n;
    else
      execute p_sql;
      get diagnostics n = row_count;
    end if;
    raise exception using errcode = 'P9999', message = n::text;
  exception
    when sqlstate 'P9999' then return 'rows:' || sqlerrm;
    when insufficient_privilege then return 'denied';
    when others then return 'error:' || sqlstate;
  end;
end;
$$;

create function pg_temp.matrix()
returns setof text
language plpgsql
as $$
declare
  w constant uuid := 'a6000000-0000-0000-0000-000000000000';
  users constant jsonb := '{
    "owner": "00000000-0000-0000-0000-00000000000a",
    "editor": "00000000-0000-0000-0000-00000000000b",
    "commenter": "00000000-0000-0000-0000-00000000000c",
    "viewer": "00000000-0000-0000-0000-00000000000d",
    "outsider": "00000000-0000-0000-0000-00000000000e"}';
  -- table -> [target row id, insert statement]
  specs constant jsonb := jsonb_build_object(
    'companies', jsonb_build_array('c6000000-0000-0000-0000-000000000002',
      format('insert into public.companies (workspace_id, name) values (%L, gen_random_uuid()::text)', w)),
    'recruiters', jsonb_build_array('e6000000-0000-0000-0000-000000000002',
      format('insert into public.recruiters (workspace_id, name) values (%L, ''New'')', w)),
    'opportunities', jsonb_build_array('06000000-0000-0000-0000-000000000002',
      format('insert into public.opportunities (workspace_id, company_id, title, work_mode, employment_type) values (%L, ''c6000000-0000-0000-0000-000000000001'', ''New'', ''remote'', ''full_time'')', w)),
    'recruiter_calls', jsonb_build_array('d6000000-0000-0000-0000-000000000002',
      format('insert into public.recruiter_calls (workspace_id, opportunity_id, call_at, duration_minutes, interest_level) values (%L, ''06000000-0000-0000-0000-000000000001'', now(), 10, 5)', w)),
    'interviews', jsonb_build_array('16000000-0000-0000-0000-000000000002',
      format('insert into public.interviews (workspace_id, opportunity_id, title, stage, scheduled_at, duration_minutes, format) values (%L, ''06000000-0000-0000-0000-000000000001'', ''New'', ''technical'', now(), 60, ''video'')', w)),
    'questions', jsonb_build_array('26000000-0000-0000-0000-000000000002',
      format('insert into public.questions (workspace_id, type, topic, difficulty, question) values (%L, ''technical'', ''AWS'', ''easy'', ''New?'')', w)),
    'preparation_tasks', jsonb_build_array('36000000-0000-0000-0000-000000000002',
      format('insert into public.preparation_tasks (workspace_id, opportunity_id, title, category) values (%L, ''06000000-0000-0000-0000-000000000001'', ''New'', ''technical'')', w)),
    'follow_up_tasks', jsonb_build_array('46000000-0000-0000-0000-000000000002',
      format('insert into public.follow_up_tasks (workspace_id, opportunity_id, title, due_date) values (%L, ''06000000-0000-0000-0000-000000000001'', ''New'', current_date)', w)),
    'star_stories', jsonb_build_array('56000000-0000-0000-0000-000000000002',
      format('insert into public.star_stories (workspace_id, title) values (%L, ''New'')', w)),
    'shared_notes', jsonb_build_array('f6000000-0000-0000-0000-000000000002',
      format('insert into public.shared_notes (workspace_id, title) values (%L, ''New'')', w))
  );
  writers constant text[] := array['owner', 'editor'];
  readers constant text[] := array['owner', 'editor', 'commenter', 'viewer'];
  t text;
  r text;
  uid uuid;
  row_id uuid;
  got text;
  total bigint;
begin
  for t in select jsonb_object_keys(specs) order by 1 loop
    row_id := (specs -> t ->> 0)::uuid;
    -- Ground truth, read with RLS bypassed (test runs as postgres).
    execute format('select count(*) from public.%I where workspace_id = %L', t, w) into total;
    for r in select unnest(array['owner', 'editor', 'commenter', 'viewer', 'outsider']) loop
      uid := (users ->> r)::uuid;

      got := pg_temp.attempt(uid, format('select count(*) from public.%I where workspace_id = %L', t, w), 'count');
      return next is(got, case when r = any(readers) and total > 0 then 'rows:' || total else 'rows:0' end,
        format('%s: %s %s read', t, r, case when r = any(readers) then 'can' else 'cannot' end));

      got := pg_temp.attempt(uid, specs -> t ->> 1, 'exec');
      return next is(got, case when r = any(writers) then 'rows:1' else 'denied' end,
        format('%s: %s %s insert', t, r, case when r = any(writers) then 'can' else 'cannot' end));

      got := pg_temp.attempt(uid, format('update public.%I set updated_at = now() where id = %L', t, row_id), 'exec');
      return next is(got, case when r = any(writers) then 'rows:1' else 'rows:0' end,
        format('%s: %s %s update', t, r, case when r = any(writers) then 'can' else 'cannot' end));

      got := pg_temp.attempt(uid, format('delete from public.%I where id = %L', t, row_id), 'exec');
      return next is(got, case when r = any(writers) then 'rows:1' else 'rows:0' end,
        format('%s: %s %s delete', t, r, case when r = any(writers) then 'can' else 'cannot' end));
    end loop;
  end loop;

  -- Anonymous clients have no privileges on any table.
  for t in select tablename from pg_tables where schemaname = 'public' order by 1 loop
    got := pg_temp.attempt(null, format('select count(*) from public.%I', t), 'count');
    return next is(got, 'denied', format('%s: anon cannot read', t));
  end loop;
end;
$$;

select * from pg_temp.matrix();

select * from finish();
rollback;
