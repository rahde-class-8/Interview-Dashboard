-- Phase 6: invitations, shared notes, comments, activity events, Realtime authorization.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(56);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000010a1', 'collab-owner@example.com'),
  ('00000000-0000-0000-0000-0000000010b2', 'collab-editor@example.com'),
  ('00000000-0000-0000-0000-0000000010c3', 'collab-commenter@example.com'),
  ('00000000-0000-0000-0000-0000000010d4', 'collab-invitee@example.com'),
  ('00000000-0000-0000-0000-0000000010e5', 'collab-outsider@example.com');
update profiles set display_name = 'Owner Olivia' where id = '00000000-0000-0000-0000-0000000010a1';
update profiles set display_name = 'Invitee Ivan' where id = '00000000-0000-0000-0000-0000000010d4';
insert into workspaces (id, name, owner_id) values
  ('a1000000-0000-0000-0000-000000000000', 'Collab', '00000000-0000-0000-0000-0000000010a1');
insert into workspace_members (workspace_id, user_id, role) values
  ('a1000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000010b2', 'editor'),
  ('a1000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000010c3', 'commenter');

-- Runs a statement as a user; returns the scalar result, or 'denied' / 'error:<sqlstate>'.
create function pg_temp.as_user(p_user uuid, p_sql text)
returns text
language plpgsql
as $$
declare
  v text;
begin
  begin
    if p_user is null then
      perform set_config('role', 'anon', true);
    else
      perform set_config('role', 'authenticated', true);
      perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
    end if;
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

create function pg_temp.events(p_action text)
returns integer
language sql
as $$
  select count(*)::int from public.activity_events
  where workspace_id = 'a1000000-0000-0000-0000-000000000000' and action = p_action;
$$;

-- Invitations -------------------------------------------------------------------------
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010a1', $$
  insert into workspace_invitations (workspace_id, email, role, token_hash, invited_by)
  values ('a1000000-0000-0000-0000-000000000000', 'collab-editor@example.com', 'viewer',
          extensions.digest('member-token-0123456789abcdef0123456789abcdef', 'sha256'), '00000000-0000-0000-0000-0000000010a1')
  returning 1$$), 'error:P0001', 'existing members cannot be invited again');

insert into workspace_invitations (workspace_id, email, role, token_hash, invited_by, expires_at) values
  ('a1000000-0000-0000-0000-000000000000', 'collab-invitee@example.com', 'editor',
   extensions.digest('stale-token-0123456789abcdef0123456789abcdef', 'sha256'), '00000000-0000-0000-0000-0000000010a1', now() - interval '1 hour');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010a1', $$
  insert into workspace_invitations (workspace_id, email, role, token_hash, invited_by)
  values ('a1000000-0000-0000-0000-000000000000', 'Collab-Invitee@Example.com', 'commenter',
          extensions.digest('fresh-token-0123456789abcdef0123456789abcdef', 'sha256'), '00000000-0000-0000-0000-0000000010a1')
  returning 1$$), '1', 'an expired pending invitation does not block a new one');
select is((select status from workspace_invitations where token_hash = extensions.digest('stale-token-0123456789abcdef0123456789abcdef', 'sha256')),
  'expired', 'the stale invitation is marked expired');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010a1', $$
  insert into workspace_invitations (workspace_id, email, role, token_hash, invited_by)
  values ('a1000000-0000-0000-0000-000000000000', 'collab-invitee@example.com', 'viewer',
          extensions.digest('dupe-token-0123456789abcdef0123456789abcdef0', 'sha256'), '00000000-0000-0000-0000-0000000010a1')
  returning 1$$), 'error:P0001', 'only one pending invitation per email');

select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010e5',
  $$select workspace_name || '|' || role || '|' || invited_by_name || '|' || email_matches
    from public.preview_invitation('fresh-token-0123456789abcdef0123456789abcdef')$$),
  'Collab|commenter|Owner Olivia|false', 'the link holder sees only workspace, role and inviter (email mismatch flagged)');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010d4',
  $$select email_matches::text from public.preview_invitation('fresh-token-0123456789abcdef0123456789abcdef')$$),
  'true', 'the invited account matches');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010d4',
  $$select count(*) from public.preview_invitation('stale-token-0123456789abcdef0123456789abcdef')$$),
  'error:P0002', 'expired invitations cannot be previewed');
select is(pg_temp.as_user(null,
  $$select count(*) from public.preview_invitation('fresh-token-0123456789abcdef0123456789abcdef')$$),
  'denied', 'anonymous callers cannot preview invitations');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010e5',
  $$select count(*) from public.accept_invitation('fresh-token-0123456789abcdef0123456789abcdef')$$),
  'denied', 'another account cannot accept the invitation');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010d4',
  $$select role from public.accept_invitation('fresh-token-0123456789abcdef0123456789abcdef')$$),
  'commenter', 'the invited account joins with the invited role');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010d4',
  $$select count(*) from public.preview_invitation('fresh-token-0123456789abcdef0123456789abcdef')$$),
  'error:P0002', 'accepted invitations cannot be previewed or reused');

-- Member management -----------------------------------------------------------------------
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010b2',
  $$with u as (update workspace_members set role = 'editor' where user_id = '00000000-0000-0000-0000-0000000010d4' returning 1) select count(*) from u$$),
  '0', 'editors cannot change roles');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010a1',
  $$with u as (update workspace_members set role = 'editor' where user_id = '00000000-0000-0000-0000-0000000010d4' returning 1) select count(*) from u$$),
  '1', 'owners can change roles');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010a1',
  $$with u as (update workspace_members set role = 'owner' where user_id = '00000000-0000-0000-0000-0000000010d4' returning 1) select count(*) from u$$),
  'denied', 'ownership cannot be granted by a role change');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010c3',
  $$with d as (delete from workspace_members where user_id = '00000000-0000-0000-0000-0000000010b2' returning 1) select count(*) from d$$),
  '0', 'non-owners cannot remove other members');

-- Shared notes -------------------------------------------------------------------------------
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010b2', $$
  insert into shared_notes (id, workspace_id, title, body, created_by, updated_by)
  values ('f1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'Prep plan', 'Draft',
          '00000000-0000-0000-0000-0000000010a1', '00000000-0000-0000-0000-0000000010a1')
  returning created_by::text || '|' || updated_by::text$$),
  '00000000-0000-0000-0000-0000000010b2|00000000-0000-0000-0000-0000000010b2',
  'note authorship is set by the database, not the client');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010d4', $$
  update shared_notes set body = 'Draft v2', created_by = null where id = 'f1000000-0000-0000-0000-000000000001'
  returning version || '|' || created_by::text || '|' || updated_by::text$$),
  '2|00000000-0000-0000-0000-0000000010b2|00000000-0000-0000-0000-0000000010d4',
  'edits bump the version and record the editor; the creator cannot be changed');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010c3',
  $$with u as (update shared_notes set body = 'x' where id = 'f1000000-0000-0000-0000-000000000001' returning 1) select count(*) from u$$),
  '0', 'commenters cannot edit notes');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010d4',
  $$update shared_notes set body = 'Draft v3' where id = 'f1000000-0000-0000-0000-000000000001' and version = 1 returning 1$$),
  null, 'an update based on a stale version changes nothing (optimistic concurrency)');

-- Comments -----------------------------------------------------------------------------------
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010c3', $$
  insert into comments (workspace_id, note_id, author_id, body)
  values ('a1000000-0000-0000-0000-000000000000',
          'f1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000010c3', 'Add system design')
  returning edited_at is null$$), 'true', 'commenters can comment');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010c3',
  $$update comments set body = 'Add system design and SQL' where note_id = 'f1000000-0000-0000-0000-000000000001' returning edited_at is not null$$),
  'true', 'edits are timestamped by the database');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010a1',
  $$update comments set deleted_at = now() - interval '1 year' where note_id = 'f1000000-0000-0000-0000-000000000001'
    returning body || '|' || (deleted_at > now() - interval '1 minute')$$),
  '|true', 'the owner can delete a comment; the text is cleared and the time set by the database');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010c3',
  $$update comments set body = 'Back again', deleted_at = null where note_id = 'f1000000-0000-0000-0000-000000000001' returning 1$$),
  'error:P0001', 'deleted comments cannot be restored or edited');

-- Activity -----------------------------------------------------------------------------------
select is(pg_temp.events('invitation.sent'), 2, 'sending invitations is recorded');
select is((select count(*)::int from activity_events where metadata::text ilike '%@example.com%'), 0,
  'activity metadata never contains email addresses');
select is((select actor_id::text || '|' || (metadata ->> 'name') || '|' || (metadata ->> 'role') from activity_events
            where action = 'member.joined' and entity_id = '00000000-0000-0000-0000-0000000010d4'),
  '00000000-0000-0000-0000-0000000010d4|Invitee Ivan|commenter', 'joining is recorded with the new member as actor');
select is((select actor_id::text || '|' || (metadata ->> 'from') || '>' || (metadata ->> 'to') from activity_events
            where action = 'member.role_changed' and workspace_id = 'a1000000-0000-0000-0000-000000000000'),
  '00000000-0000-0000-0000-0000000010a1|commenter>editor', 'role changes are recorded with the owner as actor');
select is(pg_temp.events('member.joined'), 3, 'every new member is recorded (two added directly, one by invitation)');
select is(pg_temp.events('note.created'), 1, 'creating a note is recorded');
select is(pg_temp.events('note.updated'), 1, 'editing a note is recorded');
select lives_ok($$select pg_temp.as_user('00000000-0000-0000-0000-0000000010d4',
  $q$update shared_notes set body = 'Draft v4' where id = 'f1000000-0000-0000-0000-000000000001' returning 1$q$)$$,
  'repeated edits succeed');
select is(pg_temp.events('note.updated'), 1, 'repeated edits by the same person within 10 minutes are recorded once');
select is(pg_temp.events('comment.added') || '|' || pg_temp.events('comment.deleted'), '1|1', 'comments are recorded');

insert into companies (id, workspace_id, name) values
  ('c1000000-0000-0000-0000-0000000000c0', 'a1000000-0000-0000-0000-000000000000', 'Fictional Freight');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010b2', $$
  insert into opportunities (id, workspace_id, company_id, title, work_mode, employment_type)
  values ('01000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'c1000000-0000-0000-0000-0000000000c0',
          'Cloud Engineer', 'remote', 'full_time') returning 1$$), '1', 'an editor creates an opportunity');
select pg_temp.as_user('00000000-0000-0000-0000-0000000010b2',
  $$update opportunities set stage = 'technical' where id = '01000000-0000-0000-0000-000000000001' returning 1$$);
select pg_temp.as_user('00000000-0000-0000-0000-0000000010b2',
  $$update opportunities set location = 'Remote (US)' where id = '01000000-0000-0000-0000-000000000001' returning 1$$);
select is((select metadata ->> 'title' || '|' || (metadata ->> 'company') || '|' || (metadata ->> 'stage') || '|' || actor_id::text
            from activity_events where action = 'opportunity.created' and entity_id = '01000000-0000-0000-0000-000000000001'),
  'Cloud Engineer|Fictional Freight|new|00000000-0000-0000-0000-0000000010b2', 'creating an opportunity is recorded with labels');
select is((select (metadata ->> 'from') || '>' || (metadata ->> 'to') from activity_events
            where action = 'opportunity.stage_changed' and entity_id = '01000000-0000-0000-0000-000000000001'),
  'new>technical', 'stage changes are recorded');
select is((select count(*)::int from activity_events where entity_id = '01000000-0000-0000-0000-000000000001'), 2,
  'unimportant field edits are not recorded');

insert into recruiter_calls (id, workspace_id, opportunity_id, call_at, duration_minutes, interest_level) values
  ('d1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', '01000000-0000-0000-0000-000000000001', now(), 30, 8);
select is(pg_temp.events('call.logged'), 1, 'logging a call is recorded');
insert into preparation_tasks (id, workspace_id, opportunity_id, title, category) values
  ('e1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', '01000000-0000-0000-0000-000000000001', 'Review VPC design', 'technical');
update preparation_tasks set completed_at = now() where id = 'e1000000-0000-0000-0000-000000000001';
update preparation_tasks set title = 'Review VPC design (done)' where id = 'e1000000-0000-0000-0000-000000000001';
select is(pg_temp.events('preparation_task.completed'), 1, 'completing a task is recorded once');

insert into recordings (id, workspace_id, recruiter_call_id, uploaded_by, file_name, storage_path, mime_type, file_size, consent_confirmed_at) values
  ('91000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000000', 'd1000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000010b2', 'Dana call with phone 555-0100.mp3',
   'a1000000-0000-0000-0000-000000000000/d1000000-0000-0000-0000-000000000001/91000000-0000-0000-0000-000000000001.mp3', 'audio/mpeg', 100, now());
select public.mark_recording_uploaded('91000000-0000-0000-0000-000000000001');
select public.soft_delete_recording('91000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000010a1');
select is((select actor_id::text from activity_events where action = 'recording.uploaded'),
  '00000000-0000-0000-0000-0000000010b2', 'uploads made through the service role are attributed to the uploader');
select is((select actor_id::text from activity_events where action = 'recording.deleted'),
  '00000000-0000-0000-0000-0000000010a1', 'deletions made through the service role are attributed to the API caller');
select is((select count(*)::int from activity_events where metadata::text like '%555-0100%' or metadata::text like '%.mp3%'), 0,
  'recording file names (which may contain personal data) are not copied into activity');

select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010a1',
  $$with d as (delete from workspace_members where workspace_id = 'a1000000-0000-0000-0000-000000000000' and user_id = '00000000-0000-0000-0000-0000000010c3' returning 1) select count(*) from d$$),
  '1', 'owners can remove members');
select is(pg_temp.events('member.removed'), 1, 'removing a member is recorded');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010d4',
  $$with d as (delete from workspace_members where workspace_id = 'a1000000-0000-0000-0000-000000000000' and user_id = '00000000-0000-0000-0000-0000000010d4' returning 1) select count(*) from d$$),
  '1', 'members can leave');
select is(pg_temp.events('member.left'), 1, 'leaving is recorded');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010d4',
  $$select count(*) from activity_events where workspace_id = 'a1000000-0000-0000-0000-000000000000'$$),
  '0', 'former members can no longer read the activity log');

-- Realtime -------------------------------------------------------------------------------------
select ok(
  (select count(*) from realtime.messages
    where topic = 'workspace:a1000000-0000-0000-0000-000000000000' and private and event = 'change'
      and payload ->> 'table' = 'opportunities' and payload ->> 'recordId' = '01000000-0000-0000-0000-000000000001') >= 1,
  'changes are broadcast on the private workspace topic');
select ok(
  (select count(*) from realtime.messages
    where topic = 'workspace:a1000000-0000-0000-0000-000000000000'
      and payload ->> 'table' = 'companies' and payload ->> 'recordId' = 'c1000000-0000-0000-0000-0000000000c0') = 1,
  'reference data (companies, recruiters, questions, STAR stories) is broadcast too');
select is(
  (select count(*)::int from realtime.messages
    where topic = 'workspace:a1000000-0000-0000-0000-000000000000'
      and (payload ? 'title' or payload ? 'body' or payload ? 'record' or payload::text like '%Cloud Engineer%')),
  0, 'broadcast payloads identify rows but never carry their contents');

create function pg_temp.can_receive(p_user uuid, p_topic text)
returns text
language plpgsql
as $$
declare
  v text;
begin
  perform set_config('realtime.topic', p_topic, true);
  v := pg_temp.as_user(p_user, $q$select count(*) from realtime.messages where extension = 'broadcast'$q$);
  perform set_config('realtime.topic', '', true);
  return v;
end;
$$;
select ok(pg_temp.can_receive('00000000-0000-0000-0000-0000000010b2', 'workspace:a1000000-0000-0000-0000-000000000000')::int > 0,
  'members are authorized for their workspace topic');
select is(pg_temp.can_receive('00000000-0000-0000-0000-0000000010e5', 'workspace:a1000000-0000-0000-0000-000000000000'), '0',
  'outsiders are not authorized for the workspace topic');
select is(pg_temp.can_receive('00000000-0000-0000-0000-0000000010d4', 'workspace:a1000000-0000-0000-0000-000000000000'), '0',
  'members who left lose access to the topic');
select is(pg_temp.can_receive('00000000-0000-0000-0000-0000000010b2', 'workspace:not-a-uuid'), '0',
  'malformed topics are denied without errors');
select is(pg_temp.as_user('00000000-0000-0000-0000-0000000010a1', $$
  insert into realtime.messages (topic, extension, event, payload, private)
  values ('workspace:a1000000-0000-0000-0000-000000000000', 'broadcast', 'change', '{}', true) returning 1$$),
  'denied', 'clients cannot publish to workspace topics');

-- Deleting the workspace still works with activity triggers in place.
select lives_ok($$delete from workspaces where id = 'a1000000-0000-0000-0000-000000000000'$$,
  'deleting a workspace cascades without activity errors');

select * from finish();
rollback;
