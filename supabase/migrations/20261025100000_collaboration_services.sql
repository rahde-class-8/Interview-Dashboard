-- Phase 6: collaboration.
--
--   * invitations: expiry housekeeping, member/duplicate checks, safe preview;
--   * comments: soft delete clears the text; deleted comments are immutable;
--   * shared notes: authorship stamped by the database (optimistic concurrency
--     via `version` already exists — this is NOT simultaneous text editing);
--   * activity events: written by triggers for important changes;
--   * Realtime: change notifications broadcast on private per-workspace topics
--     ("workspace:<id>"); only members can join. Payloads carry ids only — clients
--     refetch through the API, where RLS applies.

-- ---------------------------------------------------------------------------
-- Actor resolution for triggers
-- ---------------------------------------------------------------------------

-- The signed-in user, or the actor the API server passed for service-role writes
-- (set_config('app.actor_id', …, true)).
create function app.current_actor()
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select auth.uid()),
    nullif(current_setting('app.actor_id', true), '')::uuid
  );
$$;

-- Inserts an activity event unless the workspace is being deleted (cascades).
create function app.log_activity(
  p_workspace_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_metadata jsonb default '{}'::jsonb,
  p_actor uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.workspaces w where w.id = p_workspace_id) then
    return;
  end if;
  insert into public.activity_events (workspace_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_workspace_id,
    coalesce(p_actor, app.current_actor()),
    p_action,
    p_entity_type,
    p_entity_id,
    jsonb_strip_nulls(coalesce(p_metadata, '{}'::jsonb))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Comments: soft delete
-- ---------------------------------------------------------------------------

alter table public.comments drop constraint comments_body_check;
alter table public.comments add constraint comments_body_check check (
  (deleted_at is null and char_length(trim(body)) between 1 and 5000)
  or (deleted_at is not null and body = '')
);

-- Deleting clears the text; deleted comments cannot change; only authors edit
-- text (owners moderating may only delete); edits are timestamped here.
create or replace function app.guard_comment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.deleted_at is not null then
    raise exception 'This comment was deleted.' using errcode = 'P0001';
  end if;

  if new.deleted_at is not null then
    new.deleted_at := now();
    new.body := '';
    new.edited_at := old.edited_at;
    return new;
  end if;

  if current_user = 'authenticated' and old.author_id is distinct from (select auth.uid())
     and (new.body is distinct from old.body or new.edited_at is distinct from old.edited_at) then
    raise exception 'Only the author can edit a comment' using errcode = '42501';
  end if;

  new.edited_at := case when new.body is distinct from old.body then now() else old.edited_at end;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared notes: authorship is set by the database, not the client
-- ---------------------------------------------------------------------------

create function app.stamp_note_author()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := app.current_actor();
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(v_actor, new.created_by);
    new.updated_by := new.created_by;
  else
    new.created_by := old.created_by;
    new.updated_by := coalesce(v_actor, new.updated_by);
  end if;
  return new;
end;
$$;

create trigger stamp_author before insert or update on public.shared_notes
  for each row execute function app.stamp_note_author();

-- ---------------------------------------------------------------------------
-- Invitations
-- ---------------------------------------------------------------------------

create function app.prepare_invitation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Housekeeping: an expired pending invitation must not block a new one.
  update public.workspace_invitations i
  set status = 'expired'
  where i.workspace_id = new.workspace_id and lower(i.email::text) = lower(new.email::text)
    and i.status = 'pending' and i.expires_at <= now();

  if exists (
    select 1 from public.workspace_members m
    join public.profiles p on p.id = m.user_id
    where m.workspace_id = new.workspace_id and lower(p.email::text) = lower(new.email::text)
  ) then
    raise exception 'This person is already a member of the workspace.'
      using errcode = 'P0001', hint = 'already_member';
  end if;

  if exists (
    select 1 from public.workspace_invitations i
    where i.workspace_id = new.workspace_id and lower(i.email::text) = lower(new.email::text) and i.status = 'pending'
  ) then
    raise exception 'This person already has a pending invitation.'
      using errcode = 'P0001', hint = 'already_invited';
  end if;

  if (select count(*) from public.workspace_invitations i
      where i.workspace_id = new.workspace_id and i.status = 'pending') >= 50 then
    raise exception 'A workspace can have at most 50 pending invitations.'
      using errcode = 'P0001', hint = 'invitation_limit';
  end if;

  return new;
end;
$$;

create trigger prepare_invitation before insert on public.workspace_invitations
  for each row execute function app.prepare_invitation();

-- What an invitee may see before accepting: no other invitation or workspace data.
create function public.preview_invitation(p_token text)
returns table (workspace_name text, role text, invited_by_name text, expires_at timestamptz, email_matches boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 256 then
    raise exception 'Invitation is invalid or no longer available' using errcode = 'P0002';
  end if;

  return query
    select w.name, i.role, inviter.display_name, i.expires_at,
           lower(i.email::text) = lower((select p.email::text from public.profiles p where p.id = v_user_id))
    from public.workspace_invitations i
    join public.workspaces w on w.id = i.workspace_id
    left join public.profiles inviter on inviter.id = i.invited_by
    where i.token_hash = extensions.digest(p_token, 'sha256')
      and i.status = 'pending'
      and i.expires_at > now();

  if not found then
    raise exception 'Invitation is invalid or no longer available' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.preview_invitation(text) from public, anon;
grant execute on function public.preview_invitation(text) to authenticated;

-- With search_path = '' the citext "=" operator is not found, so comparisons fell
-- back to case-sensitive text equality. Compare lower-cased text explicitly.
create or replace function public.accept_invitation(p_token text)
returns table (workspace_id uuid, role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email   text;
  v_inv     public.workspace_invitations%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 256 then
    raise exception 'Invitation is invalid or no longer available' using errcode = 'P0002';
  end if;

  select p.email::text into v_email from public.profiles p where p.id = v_user_id;

  select * into v_inv
  from public.workspace_invitations i
  where i.token_hash = extensions.digest(p_token, 'sha256')
  for update;

  if not found or v_inv.status <> 'pending' or v_inv.expires_at <= now() then
    raise exception 'Invitation is invalid or no longer available' using errcode = 'P0002';
  end if;
  if v_email is null or lower(v_inv.email::text) <> lower(v_email) then
    raise exception 'This invitation was sent to a different email address' using errcode = '42501';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_inv.workspace_id, v_user_id, v_inv.role)
  on conflict on constraint workspace_members_pkey do nothing;

  update public.workspace_invitations
  set status = 'accepted', accepted_by = v_user_id, accepted_at = now()
  where id = v_inv.id;

  return query
    select m.workspace_id, m.role
    from public.workspace_members m
    where m.workspace_id = v_inv.workspace_id and m.user_id = v_user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Recordings: let the API pass the acting user for service-role deletions
-- ---------------------------------------------------------------------------

drop function public.soft_delete_recording(uuid);
create function public.soft_delete_recording(p_id uuid, p_actor uuid default null)
returns public.recordings
language plpgsql
set search_path = ''
as $$
declare
  v_row public.recordings;
begin
  if p_actor is not null then
    perform set_config('app.actor_id', p_actor::text, true);
  end if;
  update public.recordings r
  set status = 'deleted', deleted_at = now(), delete_after = null
  where r.id = p_id and r.status <> 'deleted'
  returning r.* into v_row;

  if not found then
    raise exception 'Recording not found.' using errcode = 'P0002';
  end if;
  perform set_config('app.actor_id', '', true);
  return v_row;
end;
$$;
revoke all on function public.soft_delete_recording(uuid, uuid) from public, anon, authenticated;
grant execute on function public.soft_delete_recording(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Activity: important changes, written by triggers.
-- Metadata holds display labels only (titles, names, roles, stages) — never
-- notes, contact details, storage paths or URLs.
-- ---------------------------------------------------------------------------

create function app.opportunity_label(p_opportunity_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('title', o.title, 'company', c.name)
  from public.opportunities o
  left join public.companies c on c.id = o.company_id
  where o.id = p_opportunity_id;
$$;

create function app.activity_opportunities()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform app.log_activity(new.workspace_id, 'opportunity.created', 'opportunity', new.id,
      app.opportunity_label(new.id) || jsonb_build_object('stage', new.stage));
  elsif tg_op = 'UPDATE' then
    if new.stage is distinct from old.stage then
      perform app.log_activity(new.workspace_id, 'opportunity.stage_changed', 'opportunity', new.id,
        app.opportunity_label(new.id) || jsonb_build_object('from', old.stage, 'to', new.stage));
    end if;
  else
    perform app.log_activity(old.workspace_id, 'opportunity.deleted', 'opportunity', old.id,
      jsonb_build_object('title', old.title));
  end if;
  return null;
end;
$$;

create function app.activity_calls()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform app.log_activity(new.workspace_id, 'call.logged', 'recruiter_call', new.id,
      app.opportunity_label(new.opportunity_id));
  elsif exists (select 1 from public.opportunities o where o.id = old.opportunity_id) then
    -- Only direct deletions; cascades from an opportunity are covered by its own event.
    perform app.log_activity(old.workspace_id, 'call.deleted', 'recruiter_call', old.id,
      app.opportunity_label(old.opportunity_id));
  end if;
  return null;
end;
$$;

create function app.activity_interviews()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform app.log_activity(new.workspace_id, 'interview.scheduled', 'interview', new.id,
      jsonb_build_object('title', new.title, 'opportunity', app.opportunity_label(new.opportunity_id) ->> 'title'));
  elsif new.status is distinct from old.status then
    perform app.log_activity(new.workspace_id, 'interview.status_changed', 'interview', new.id,
      jsonb_build_object('title', new.title, 'from', old.status, 'to', new.status));
  end if;
  return null;
end;
$$;

-- preparation_tasks and follow_up_tasks: completion only.
create function app.activity_task_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entity text := case tg_table_name when 'follow_up_tasks' then 'follow_up' else 'preparation_task' end;
begin
  if old.completed_at is null and new.completed_at is not null then
    perform app.log_activity(new.workspace_id, v_entity || '.completed', v_entity, new.id,
      jsonb_build_object('title', new.title));
  end if;
  return null;
end;
$$;

create function app.activity_recordings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'uploaded' and old.status = 'pending' then
    perform app.log_activity(new.workspace_id, 'recording.uploaded', 'recording', new.id,
      app.opportunity_label((select c.opportunity_id from public.recruiter_calls c where c.id = new.recruiter_call_id)),
      new.uploaded_by);
  elsif new.status = 'deleted' and old.status = 'uploaded' then
    perform app.log_activity(new.workspace_id,
      case when current_setting('app.cleanup_reason', true) = 'retention' then 'recording.expired' else 'recording.deleted' end,
      'recording', new.id,
      app.opportunity_label((select c.opportunity_id from public.recruiter_calls c where c.id = new.recruiter_call_id)));
  end if;
  return null;
end;
$$;

create function app.activity_notes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform app.log_activity(new.workspace_id, 'note.created', 'shared_note', new.id, jsonb_build_object('title', new.title));
  elsif tg_op = 'UPDATE' then
    -- One "updated" event per editor and note per 10 minutes (autosave-friendly).
    if new.version <> old.version and not exists (
      select 1 from public.activity_events e
      where e.entity_id = new.id and e.action = 'note.updated'
        and e.actor_id is not distinct from app.current_actor()
        and e.created_at > now() - interval '10 minutes'
    ) then
      perform app.log_activity(new.workspace_id, 'note.updated', 'shared_note', new.id, jsonb_build_object('title', new.title));
    end if;
  else
    perform app.log_activity(old.workspace_id, 'note.deleted', 'shared_note', old.id, jsonb_build_object('title', old.title));
  end if;
  return null;
end;
$$;

create function app.activity_comments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note_title text;
begin
  select n.title into v_note_title from public.shared_notes n where n.id = coalesce(new.note_id, old.note_id);
  if tg_op = 'INSERT' then
    perform app.log_activity(new.workspace_id, 'comment.added', 'comment', new.id,
      jsonb_build_object('note', v_note_title, 'noteId', new.note_id));
  elsif old.deleted_at is null and new.deleted_at is not null then
    perform app.log_activity(new.workspace_id, 'comment.deleted', 'comment', new.id,
      jsonb_build_object('note', v_note_title, 'noteId', new.note_id));
  end if;
  return null;
end;
$$;

create function app.activity_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := coalesce(new.user_id, old.user_id);
  v_name text := (select p.display_name from public.profiles p where p.id = v_user);
begin
  if tg_op = 'INSERT' then
    if new.role <> 'owner' then  -- the owner's own membership is created with the workspace
      perform app.log_activity(new.workspace_id, 'member.joined', 'member', new.user_id,
        jsonb_build_object('name', v_name, 'role', new.role), new.user_id);
    end if;
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role then
      perform app.log_activity(new.workspace_id, 'member.role_changed', 'member', new.user_id,
        jsonb_build_object('name', v_name, 'from', old.role, 'to', new.role));
    end if;
  else
    perform app.log_activity(old.workspace_id,
      case when app.current_actor() = old.user_id then 'member.left' else 'member.removed' end,
      'member', old.user_id, jsonb_build_object('name', v_name, 'role', old.role));
  end if;
  return null;
end;
$$;

-- The invitee's email is contact data and is not copied into activity.
create function app.activity_invitations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform app.log_activity(new.workspace_id, 'invitation.sent', 'invitation', new.id, jsonb_build_object('role', new.role));
  elsif new.status = 'revoked' and old.status = 'pending' then
    perform app.log_activity(new.workspace_id, 'invitation.revoked', 'invitation', new.id, jsonb_build_object('role', new.role));
  end if;
  return null;
end;
$$;

create function app.activity_workspaces()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.name is distinct from old.name then
    perform app.log_activity(new.id, 'workspace.renamed', 'workspace', new.id, jsonb_build_object('from', old.name, 'to', new.name));
  end if;
  if new.recording_retention_days is distinct from old.recording_retention_days then
    perform app.log_activity(new.id, 'workspace.retention_changed', 'workspace', new.id,
      jsonb_build_object('days', new.recording_retention_days));
  end if;
  return null;
end;
$$;

create trigger activity after insert or update of stage or delete on public.opportunities
  for each row execute function app.activity_opportunities();
create trigger activity after insert or delete on public.recruiter_calls
  for each row execute function app.activity_calls();
create trigger activity after insert or update of status on public.interviews
  for each row execute function app.activity_interviews();
create trigger activity after update of completed_at on public.preparation_tasks
  for each row execute function app.activity_task_completed();
create trigger activity after update of completed_at on public.follow_up_tasks
  for each row execute function app.activity_task_completed();
create trigger activity after update of status on public.recordings
  for each row execute function app.activity_recordings();
create trigger activity after insert or update or delete on public.shared_notes
  for each row execute function app.activity_notes();
create trigger activity after insert or update of deleted_at on public.comments
  for each row execute function app.activity_comments();
create trigger activity after insert or update of role or delete on public.workspace_members
  for each row execute function app.activity_members();
create trigger activity after insert or update of status on public.workspace_invitations
  for each row execute function app.activity_invitations();
create trigger activity after update of name, recording_retention_days on public.workspaces
  for each row execute function app.activity_workspaces();

create index activity_events_entity_idx on public.activity_events (entity_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Realtime: private per-workspace change notifications
-- ---------------------------------------------------------------------------

-- "workspace:<uuid>" → uuid; anything else → null (never raises inside a policy).
create function app.workspace_topic_id(p_topic text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_topic ~ '^workspace:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then substr(p_topic, 11)::uuid
  end;
$$;

-- Payload: which row changed — never its contents. Clients refetch via the API.
create function app.broadcast_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record := coalesce(new, old);
  v_workspace uuid;
  v_record uuid;
begin
  if tg_table_name = 'workspaces' then
    v_workspace := v_row.id;
    v_record := v_row.id;
  elsif tg_table_name = 'workspace_members' then
    v_workspace := v_row.workspace_id;
    v_record := v_row.user_id;
  else
    v_workspace := v_row.workspace_id;
    v_record := v_row.id;
  end if;

  perform realtime.send(
    jsonb_build_object('table', tg_table_name, 'op', tg_op, 'recordId', v_record, 'workspaceId', v_workspace),
    'change',
    'workspace:' || v_workspace,
    true
  );
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'opportunities', 'recruiter_calls', 'interviews', 'preparation_tasks', 'follow_up_tasks',
    'comments', 'activity_events', 'shared_notes', 'recordings', 'workspace_members', 'workspaces'
  ]
  loop
    execute format(
      'create trigger broadcast after insert or update or delete on public.%I
         for each row execute function app.broadcast_change()', t);
  end loop;
end;
$$;

-- Members (any role) may receive broadcasts on their workspace topics. There is
-- deliberately no INSERT policy: clients cannot send messages or presence.
create policy workspace_members_receive_broadcasts on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and app.has_workspace_role(app.workspace_topic_id((select realtime.topic())), 'viewer')
  );

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function app.current_actor() from public;
revoke all on function app.log_activity(uuid, text, text, uuid, jsonb, uuid) from public;
revoke all on function app.stamp_note_author() from public;
revoke all on function app.prepare_invitation() from public;
revoke all on function app.opportunity_label(uuid) from public;
revoke all on function app.activity_opportunities() from public;
revoke all on function app.activity_calls() from public;
revoke all on function app.activity_interviews() from public;
revoke all on function app.activity_task_completed() from public;
revoke all on function app.activity_recordings() from public;
revoke all on function app.activity_notes() from public;
revoke all on function app.activity_comments() from public;
revoke all on function app.activity_members() from public;
revoke all on function app.activity_invitations() from public;
revoke all on function app.activity_workspaces() from public;
revoke all on function app.broadcast_change() from public;
revoke all on function app.workspace_topic_id(text) from public;

-- Used by the shared_notes trigger (SECURITY INVOKER) and the Realtime policy.
grant execute on function app.current_actor() to authenticated, service_role;
grant execute on function app.workspace_topic_id(text) to authenticated;
