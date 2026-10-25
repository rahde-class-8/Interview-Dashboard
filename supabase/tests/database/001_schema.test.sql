-- Schema-wide guarantees: tables exist, UUID keys, RLS enabled + forced,
-- no anonymous privileges, hardened functions, deny-by-default for clients.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

select tables_are(
  'public',
  array[
    'profiles', 'workspaces', 'workspace_members', 'workspace_invitations',
    'companies', 'recruiters', 'opportunities', 'recruiter_calls',
    'recordings', 'storage_cleanup_queue', 'rate_limit_counters',
    'interviews', 'questions', 'preparation_tasks', 'follow_up_tasks', 'star_stories',
    'shared_notes', 'comments', 'activity_events'
  ],
  'public schema contains exactly the expected tables'
);

select is(
  (select count(*)::int
     from information_schema.columns c
     join information_schema.table_constraints tc
       on tc.table_schema = c.table_schema and tc.table_name = c.table_name and tc.constraint_type = 'PRIMARY KEY'
     join information_schema.key_column_usage k
       on k.constraint_name = tc.constraint_name and k.table_schema = c.table_schema and k.column_name = c.column_name
    where c.table_schema = 'public' and c.data_type <> 'uuid'),
  0,
  'every primary-key column is a uuid'
);

select is(
  (select array_agg(relname::text order by relname) from pg_class
    where relnamespace = 'public'::regnamespace and relkind = 'r'
      and not (relrowsecurity and relforcerowsecurity)),
  null,
  'every public table has RLS enabled and forced'
);

select is(
  (select array_agg(distinct table_name::text) from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'),
  null,
  'anon has no privileges on any public table'
);

select is(
  (select array_agg(privilege_type::text) from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'storage_cleanup_queue' and grantee = 'authenticated'),
  null,
  'authenticated has no privileges on storage_cleanup_queue'
);

select is(
  (select array_agg(p.proname::text) from pg_proc p
    where p.pronamespace = 'app'::regnamespace
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')),
  null,
  'every app.* function pins search_path'
);

select is(
  (select array_agg(p.proname::text) from pg_proc p
    where p.pronamespace in ('app'::regnamespace, 'public'::regnamespace)
      and has_function_privilege('anon', p.oid, 'execute')),
  null,
  'anon cannot execute any app/public function'
);

select ok(
  not has_schema_privilege('anon', 'app', 'usage'),
  'anon has no usage on the private app schema'
);

select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p
    where p.pronamespace in ('app'::regnamespace, 'public'::regnamespace) and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'execute')),
  array['accept_invitation', 'has_workspace_role', 'preview_invitation', 'shares_workspace_with'],
  'authenticated can call only the allow-listed SECURITY DEFINER functions'
);

-- A signed-in user who is not a member of a workspace sees nothing in it and cannot write to it.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'schema-test@example.com');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select is((select count(*)::int from public.workspaces), 1, 'a user sees only workspaces they belong to (their personal one)');
select throws_ok(
  $$insert into public.companies (workspace_id, name) values (gen_random_uuid(), 'Nope')$$,
  '42501',
  null,
  'a user cannot insert into a workspace they do not belong to'
);
reset role;

select * from finish();
rollback;
