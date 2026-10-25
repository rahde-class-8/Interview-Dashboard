-- Authorization rules beyond the CRUD matrix: profiles, workspaces, members,
-- invitations (incl. acceptance), comments, recordings, activity, privileges.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(61);

-- Executes SQL as a user (NULL = anon) and returns 'rows:<n>', 'denied' or 'error:<sqlstate>'.
-- Successful statements are kept; the role is always restored afterwards.
create function pg_temp.run_as(p_user uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  n bigint;
  res text;
begin
  begin
    perform set_config('role', case when p_user is null then 'anon' else 'authenticated' end, true);
    perform set_config('request.jwt.claims',
      case when p_user is null then '{"role":"anon"}'
           else json_build_object('sub', p_user, 'role', 'authenticated')::text end, true);
    execute p_sql;
    get diagnostics n = row_count;
    res := 'rows:' || n;
  exception
    when insufficient_privilege then res := 'denied';
    when others then res := 'error:' || sqlstate;
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return res;
end;
$$;

-- Returns the single value produced by a query run as a user.
create function pg_temp.value_as(p_user uuid, p_sql text)
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
  end;
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
  return v;
end;
$$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'owner@example.com'),
  ('00000000-0000-0000-0000-00000000000b', 'editor@example.com'),
  ('00000000-0000-0000-0000-00000000000c', 'commenter@example.com'),
  ('00000000-0000-0000-0000-00000000000d', 'viewer@example.com'),
  ('00000000-0000-0000-0000-00000000000e', 'outsider@example.com'),
  ('00000000-0000-0000-0000-0000000000f1', 'invitee@example.com');
insert into workspaces (id, name, owner_id) values
  ('a7000000-0000-0000-0000-000000000000', 'W', '00000000-0000-0000-0000-00000000000a');
insert into workspace_members (workspace_id, user_id, role) values
  ('a7000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000b', 'editor'),
  ('a7000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000c', 'commenter'),
  ('a7000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000d', 'viewer');

-- Profiles --------------------------------------------------------------------------
select is(pg_temp.value_as('00000000-0000-0000-0000-00000000000a',
  $$select count(*) from profiles where email like '%@example.com' and email not like 'invitee%'$$), '4',
  'members see profiles of people they share a workspace with');
select is(pg_temp.value_as('00000000-0000-0000-0000-00000000000e',
  $$select count(*) from profiles$$), '1',
  'an outsider sees only their own profile');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000b',
  $$update profiles set display_name = 'Eddie' where id = '00000000-0000-0000-0000-00000000000b'$$), 'rows:1',
  'users can edit their own display name');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000b',
  $$update profiles set display_name = 'Hacked' where id = '00000000-0000-0000-0000-00000000000a'$$), 'rows:0',
  'users cannot edit another user''s profile');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000b',
  $$update profiles set email = 'x@example.com' where id = '00000000-0000-0000-0000-00000000000b'$$), 'denied',
  'profile email is not client-editable');

-- Workspaces ------------------------------------------------------------------------
select is(pg_temp.value_as('00000000-0000-0000-0000-00000000000e',
  $$select count(*) from workspaces where id = 'a7000000-0000-0000-0000-000000000000'$$), '0',
  'outsiders cannot see the workspace');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000d',
  $$insert into workspaces (name, owner_id) values ('Viewer side project', '00000000-0000-0000-0000-00000000000d')$$), 'rows:1',
  'any user can create a workspace they own');
select is((select m.role from workspace_members m join workspaces w on w.id = m.workspace_id
  where w.name = 'Viewer side project' and m.user_id = '00000000-0000-0000-0000-00000000000d'), 'owner',
  'the creator becomes the owner member');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000d',
  $$insert into workspaces (name, owner_id) values ('Not mine', '00000000-0000-0000-0000-00000000000a')$$), 'denied',
  'users cannot create workspaces owned by someone else');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000b',
  $$update workspaces set name = 'Renamed' where id = 'a7000000-0000-0000-0000-000000000000'$$), 'rows:0',
  'editors cannot change workspace settings');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000a',
  $$update workspaces set name = 'Renamed' where id = 'a7000000-0000-0000-0000-000000000000'$$), 'rows:1',
  'owners can rename the workspace');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000a',
  $$update workspaces set storage_quota_bytes = 1e12 where id = 'a7000000-0000-0000-0000-000000000000'$$), 'denied',
  'the storage quota is not client-editable');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000b',
  $$delete from workspaces where id = 'a7000000-0000-0000-0000-000000000000'$$), 'rows:0',
  'editors cannot delete the workspace');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000d',
  $$delete from workspaces where name = 'Viewer side project'$$), 'rows:1',
  'owners can delete their workspace');

-- Members ---------------------------------------------------------------------------
select is(pg_temp.value_as('00000000-0000-0000-0000-00000000000d',
  $$select count(*) from workspace_members where workspace_id = 'a7000000-0000-0000-0000-000000000000'$$), '4',
  'members can see the member list');
select is(pg_temp.value_as('00000000-0000-0000-0000-00000000000e',
  $$select count(*) from workspace_members where workspace_id = 'a7000000-0000-0000-0000-000000000000'$$), '0',
  'outsiders cannot see the member list');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000b',
  $$update workspace_members set role = 'editor' where user_id = '00000000-0000-0000-0000-00000000000d'$$), 'rows:0',
  'editors cannot change roles');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000a',
  $$update workspace_members set role = 'commenter'
    where workspace_id = 'a7000000-0000-0000-0000-000000000000' and user_id = '00000000-0000-0000-0000-00000000000d'$$), 'rows:1',
  'owners can change a member''s role');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000a',
  $$update workspace_members set role = 'owner'
    where workspace_id = 'a7000000-0000-0000-0000-000000000000' and user_id = '00000000-0000-0000-0000-00000000000c'$$), 'denied',
  'owners cannot promote someone to owner directly (transfer function only)');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000b',
  $$insert into workspace_members (workspace_id, user_id, role)
    values ('a7000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000e', 'viewer')$$), 'denied',
  'members cannot be added directly (only via invitation)');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000d',
  $$delete from workspace_members
    where workspace_id = 'a7000000-0000-0000-0000-000000000000' and user_id = '00000000-0000-0000-0000-00000000000d'$$), 'rows:1',
  'a member can leave a workspace');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000a',
  $$delete from workspace_members
    where workspace_id = 'a7000000-0000-0000-0000-000000000000' and user_id = '00000000-0000-0000-0000-00000000000c'$$), 'rows:1',
  'owners can remove members');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000a',
  $$delete from workspace_members
    where workspace_id = 'a7000000-0000-0000-0000-000000000000' and user_id = '00000000-0000-0000-0000-00000000000a'$$), 'error:P0001',
  'the owner cannot leave without transferring ownership');

insert into workspace_members (workspace_id, user_id, role) values
  ('a7000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000c', 'commenter'),
  ('a7000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000d', 'viewer');

-- Invitations -----------------------------------------------------------------------
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000a',
  $$insert into workspace_invitations (workspace_id, email, role, token_hash, invited_by)
    values ('a7000000-0000-0000-0000-000000000000', 'invitee@example.com', 'commenter',
            extensions.digest('token-one-0123456789abcdef0123456789abcdef', 'sha256'), '00000000-0000-0000-0000-00000000000a')$$), 'rows:1',
  'owners can create invitations');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000b',
  $$insert into workspace_invitations (workspace_id, email, role, token_hash, invited_by)
    values ('a7000000-0000-0000-0000-000000000000', 'x@example.com', 'viewer',
            extensions.digest('editor-token-0123456789abcdef0123456789', 'sha256'), '00000000-0000-0000-0000-00000000000b')$$), 'denied',
  'editors cannot invite');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000a',
  $$insert into workspace_invitations (workspace_id, email, role, token_hash, invited_by)
    values ('a7000000-0000-0000-0000-000000000000', 'y@example.com', 'viewer',
            extensions.digest('spoof-token-0123456789abcdef0123456789', 'sha256'), '00000000-0000-0000-0000-00000000000b')$$), 'denied',
  'invited_by must be the inviting user');
select is(pg_temp.value_as('00000000-0000-0000-0000-00000000000a',
  $$select count(token_hash)::text from workspace_invitations$$), 'denied',
  'token hashes are never readable by clients');
select is(pg_temp.value_as('00000000-0000-0000-0000-00000000000a',
  $$select count(*) from workspace_invitations where status = 'pending'$$), '1',
  'owners can list invitations');
select is(pg_temp.value_as('00000000-0000-0000-0000-00000000000b',
  $$select count(*) from workspace_invitations$$), '0',
  'non-owners cannot list invitations');

select is(pg_temp.run_as('00000000-0000-0000-0000-0000000000f1',
  $$select * from public.accept_invitation('token-one-0123456789abcdef0123456789abcdef')$$), 'rows:1',
  'the invited user can accept with the token');
select is((select role from workspace_members where workspace_id = 'a7000000-0000-0000-0000-000000000000'
  and user_id = '00000000-0000-0000-0000-0000000000f1'), 'commenter',
  'acceptance grants the invited role');
select is(pg_temp.run_as('00000000-0000-0000-0000-0000000000f1',
  $$select * from public.accept_invitation('token-one-0123456789abcdef0123456789abcdef')$$), 'error:P0002',
  'an accepted invitation cannot be reused');

insert into workspace_invitations (workspace_id, email, role, token_hash, invited_by, status, expires_at) values
  ('a7000000-0000-0000-0000-000000000000', 'someone-else@example.com', 'viewer',
   extensions.digest('other-email-0123456789abcdef0123456789abcd', 'sha256'), '00000000-0000-0000-0000-00000000000a', 'pending', now() + interval '1 day'),
  ('a7000000-0000-0000-0000-000000000000', 'revoke-me@example.com', 'viewer',
   extensions.digest('revoked-0123456789abcdef0123456789abcdef01', 'sha256'), '00000000-0000-0000-0000-00000000000a', 'pending', now() + interval '1 day'),
  ('a7000000-0000-0000-0000-000000000000', 'expired-invitee@example.com', 'editor',
   extensions.digest('expired-0123456789abcdef0123456789abcdef01', 'sha256'), '00000000-0000-0000-0000-00000000000a', 'pending', now() - interval '1 minute');

select is(pg_temp.run_as('00000000-0000-0000-0000-0000000000f1',
  $$select * from public.accept_invitation('other-email-0123456789abcdef0123456789abcd')$$), 'denied',
  'an invitation is bound to the invited email address');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000a',
  $$update workspace_invitations set status = 'revoked' where email = 'revoke-me@example.com'$$), 'rows:1',
  'owners can revoke a pending invitation');
update workspace_invitations set email = 'invitee@example.com' where email = 'revoke-me@example.com';
select is(pg_temp.run_as('00000000-0000-0000-0000-0000000000f1',
  $$select * from public.accept_invitation('revoked-0123456789abcdef0123456789abcdef01')$$), 'error:P0002',
  'a revoked invitation cannot be accepted');
select is(pg_temp.run_as('00000000-0000-0000-0000-0000000000f1',
  $$select * from public.accept_invitation('expired-0123456789abcdef0123456789abcdef01')$$), 'error:P0002',
  'an expired invitation cannot be accepted');
select is(pg_temp.run_as(null,
  $$select * from public.accept_invitation('token-one-0123456789abcdef0123456789abcdef')$$), 'denied',
  'anonymous callers cannot use invitations');
select is(pg_temp.run_as('00000000-0000-0000-0000-0000000000f1',
  $$select * from public.accept_invitation('short')$$), 'error:P0002',
  'malformed tokens are rejected');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000a',
  $$update workspace_invitations set status = 'pending' where status = 'revoked'$$), 'rows:0',
  'a revoked invitation cannot be reactivated');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000a',
  $$update workspace_invitations set status = 'accepted' where email = 'someone-else@example.com'$$), 'denied',
  'owners cannot mark invitations accepted');

-- Comments --------------------------------------------------------------------------
insert into shared_notes (id, workspace_id, title) values
  ('f7000000-0000-0000-0000-000000000000', 'a7000000-0000-0000-0000-000000000000', 'Prep');

select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000c',
  $$insert into comments (workspace_id, note_id, author_id, body)
    values ('a7000000-0000-0000-0000-000000000000',
            'f7000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000c', 'Looks good')$$), 'rows:1',
  'commenters can comment');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000d',
  $$insert into comments (workspace_id, note_id, author_id, body)
    values ('a7000000-0000-0000-0000-000000000000', 'f7000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000d', 'Hi')$$), 'denied',
  'viewers cannot comment');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000c',
  $$insert into comments (workspace_id, note_id, author_id, body)
    values ('a7000000-0000-0000-0000-000000000000', 'f7000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000a', 'Fake')$$), 'denied',
  'comments cannot be attributed to someone else');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000c',
  $$update comments set body = 'Looks great', edited_at = now() where body like 'Looks%'$$), 'rows:1',
  'authors can edit their comment');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000b',
  $$update comments set body = 'Edited by editor' where body like 'Looks%'$$), 'rows:0',
  'other members cannot edit someone else''s comment');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000a',
  $$update comments set body = 'Edited by owner' where body like 'Looks%'$$), 'denied',
  'owners cannot rewrite someone else''s comment');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000a',
  $$update comments set deleted_at = now() where body like 'Looks%'$$), 'rows:1',
  'owners can soft-delete any comment');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000c',
  $$delete from comments where body like 'Looks%'$$), 'denied',
  'comments cannot be hard-deleted by clients');

-- Recordings ------------------------------------------------------------------------
insert into companies (id, workspace_id, name) values ('c7000000-0000-0000-0000-000000000000', 'a7000000-0000-0000-0000-000000000000', 'Co');
insert into opportunities (id, workspace_id, company_id, title, work_mode, employment_type) values
  ('07000000-0000-0000-0000-000000000000', 'a7000000-0000-0000-0000-000000000000', 'c7000000-0000-0000-0000-000000000000', 'Opp', 'remote', 'full_time');
insert into recruiter_calls (id, workspace_id, opportunity_id, call_at, duration_minutes, interest_level) values
  ('d7000000-0000-0000-0000-000000000000', 'a7000000-0000-0000-0000-000000000000', '07000000-0000-0000-0000-000000000000', now(), 30, 7);
insert into recordings (id, workspace_id, recruiter_call_id, file_name, storage_path, mime_type, file_size, consent_confirmed_at) values
  ('97000000-0000-0000-0000-000000000001', 'a7000000-0000-0000-0000-000000000000', 'd7000000-0000-0000-0000-000000000000', 'a.mp3',
   'a7000000-0000-0000-0000-000000000000/d7000000-0000-0000-0000-000000000000/97000000-0000-0000-0000-000000000001.mp3', 'audio/mpeg', 10, now());

select is(pg_temp.value_as('00000000-0000-0000-0000-00000000000d',
  $$select count(*) from recordings$$), '1',
  'viewers can see recording metadata');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000b',
  $$insert into recordings (id, workspace_id, recruiter_call_id, uploaded_by, file_name, storage_path, mime_type, file_size, consent_confirmed_at)
    values ('97000000-0000-0000-0000-000000000002', 'a7000000-0000-0000-0000-000000000000', 'd7000000-0000-0000-0000-000000000000',
            '00000000-0000-0000-0000-00000000000b', 'b.wav',
            'a7000000-0000-0000-0000-000000000000/d7000000-0000-0000-0000-000000000000/97000000-0000-0000-0000-000000000002.wav', 'audio/wav', 10, now())$$), 'rows:1',
  'editors can create pending recording metadata');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000c',
  $$insert into recordings (id, workspace_id, recruiter_call_id, uploaded_by, file_name, storage_path, mime_type, file_size, consent_confirmed_at)
    values ('97000000-0000-0000-0000-000000000003', 'a7000000-0000-0000-0000-000000000000', 'd7000000-0000-0000-0000-000000000000',
            '00000000-0000-0000-0000-00000000000c', 'c.wav',
            'a7000000-0000-0000-0000-000000000000/d7000000-0000-0000-0000-000000000000/97000000-0000-0000-0000-000000000003.wav', 'audio/wav', 10, now())$$), 'denied',
  'commenters cannot upload recordings');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000b',
  $$insert into recordings (id, workspace_id, recruiter_call_id, uploaded_by, file_name, storage_path, mime_type, file_size, consent_confirmed_at)
    values ('97000000-0000-0000-0000-000000000004', 'a7000000-0000-0000-0000-000000000000', 'd7000000-0000-0000-0000-000000000000',
            '00000000-0000-0000-0000-00000000000a', 'd.wav',
            'a7000000-0000-0000-0000-000000000000/d7000000-0000-0000-0000-000000000000/97000000-0000-0000-0000-000000000004.wav', 'audio/wav', 10, now())$$), 'denied',
  'uploads cannot be attributed to someone else');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000b',
  $$update recordings set duration_seconds = 120 where id = '97000000-0000-0000-0000-000000000002'$$), 'rows:1',
  'editors can report the recording duration');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000b',
  $$update recordings set status = 'uploaded', uploaded_at = now() where id = '97000000-0000-0000-0000-000000000002'$$), 'denied',
  'clients cannot mark uploads as verified');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000a',
  $$delete from recordings where id = '97000000-0000-0000-0000-000000000002'$$), 'denied',
  'clients cannot hard-delete recordings (server-side soft delete only)');
select is(pg_temp.value_as('00000000-0000-0000-0000-00000000000e',
  $$select count(*) from recordings$$), '0',
  'outsiders cannot see recording metadata');

-- Activity, cleanup queue, dangerous privileges -------------------------------------
insert into activity_events (workspace_id, actor_id, action, entity_type) values
  ('a7000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000a', 'note.created', 'note');
select is(pg_temp.value_as('00000000-0000-0000-0000-00000000000d',
  $$select count(*) from activity_events where action = 'note.created' and entity_type = 'note'$$), '1',
  'members can read the activity log');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000a',
  $$insert into activity_events (workspace_id, action, entity_type) values ('a7000000-0000-0000-0000-000000000000', 'note.deleted', 'note')$$), 'denied',
  'clients cannot write activity events directly');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000a',
  $$update activity_events set action = 'note.edited'$$), 'denied',
  'clients cannot alter activity events');
select is(pg_temp.value_as('00000000-0000-0000-0000-00000000000a',
  $$select count(*)::text from storage_cleanup_queue$$), 'denied',
  'clients cannot read the storage cleanup queue');
select is(pg_temp.run_as('00000000-0000-0000-0000-00000000000a',
  $$truncate public.companies cascade$$), 'denied',
  'clients cannot TRUNCATE (which would bypass RLS)');

select * from finish();
rollback;
