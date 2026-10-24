-- Phase 3: authorization. Role helpers, least-privilege grants and RLS policies
-- for every table, plus secure invitation acceptance.
--
-- Roles (ranked): owner 4 > editor 3 > commenter 2 > viewer 1.
-- RLS is the authoritative boundary; application checks only improve error messages.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function app.role_rank(p_role text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_role
    when 'owner' then 4
    when 'editor' then 3
    when 'commenter' then 2
    when 'viewer' then 1
    else 0
  end;
$$;

-- True when the current user is a member of the workspace with at least min_role.
-- SECURITY DEFINER so policies can read memberships without recursive RLS checks.
create function app.has_workspace_role(p_workspace_id uuid, p_min_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = (select auth.uid())
      and app.role_rank(m.role) >= app.role_rank(p_min_role)
  );
$$;

-- True when the current user shares at least one workspace with p_user_id.
create function app.shares_workspace_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = p_user_id
  );
$$;

revoke all on function app.role_rank(text) from public, anon;
revoke all on function app.has_workspace_role(uuid, text) from public, anon;
revoke all on function app.shares_workspace_with(uuid) from public, anon;
grant execute on function app.has_workspace_role(uuid, text) to authenticated;
grant execute on function app.shares_workspace_with(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Least-privilege grants. Supabase's defaults give authenticated every table
-- privilege, including TRUNCATE (which bypasses RLS). Replace them explicitly.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from authenticated;

-- Workspace-owned domain records: full CRUD, filtered by RLS.
grant select, insert, update, delete on
  public.companies, public.recruiters, public.opportunities, public.recruiter_calls,
  public.interviews, public.questions, public.preparation_tasks, public.follow_up_tasks,
  public.star_stories, public.shared_notes
to authenticated;

-- Profiles: created by the sign-up trigger; users may edit only display fields.
grant select on public.profiles to authenticated;
grant update (display_name, headline) on public.profiles to authenticated;

-- Workspaces: storage quota and owner are not client-editable.
grant select, delete on public.workspaces to authenticated;
grant insert (name, owner_id, recording_retention_days) on public.workspaces to authenticated;
grant update (name, recording_retention_days) on public.workspaces to authenticated;

-- Members: rows are created by the owner trigger or invitation acceptance only.
grant select, delete on public.workspace_members to authenticated;
grant update (role) on public.workspace_members to authenticated;

-- Invitations: token_hash is write-only for clients.
grant select (id, workspace_id, email, role, invited_by, status, expires_at,
              accepted_by, accepted_at, created_at, updated_at)
  on public.workspace_invitations to authenticated;
grant insert (workspace_id, email, role, token_hash, invited_by) on public.workspace_invitations to authenticated;
grant update (status) on public.workspace_invitations to authenticated;

-- Recordings: clients create pending metadata and report duration; status
-- transitions and deletion are performed by the server after verification.
grant select on public.recordings to authenticated;
grant insert (id, workspace_id, recruiter_call_id, uploaded_by, file_name, storage_path,
              mime_type, file_size, consent_confirmed_at)
  on public.recordings to authenticated;
grant update (duration_seconds) on public.recordings to authenticated;

-- Comments: soft delete via deleted_at; no hard deletes from clients.
grant select on public.comments to authenticated;
grant insert (workspace_id, note_id, author_id, body) on public.comments to authenticated;
grant update (body, edited_at, deleted_at) on public.comments to authenticated;

-- Activity: read-only for clients (written by server-side functions).
grant select on public.activity_events to authenticated;

-- storage_cleanup_queue: no client privileges (already revoked).

-- ---------------------------------------------------------------------------
-- Policies: identity and workspaces
-- ---------------------------------------------------------------------------

create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or app.shares_workspace_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy workspaces_select on public.workspaces for select to authenticated
  using (app.has_workspace_role(id, 'viewer'));
create policy workspaces_insert on public.workspaces for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy workspaces_update on public.workspaces for update to authenticated
  using (app.has_workspace_role(id, 'owner'))
  with check (app.has_workspace_role(id, 'owner'));
create policy workspaces_delete on public.workspaces for delete to authenticated
  using (app.has_workspace_role(id, 'owner'));

create policy members_select on public.workspace_members for select to authenticated
  using (app.has_workspace_role(workspace_id, 'viewer'));
-- Owners change other members' roles; promoting to owner requires the transfer function.
create policy members_update on public.workspace_members for update to authenticated
  using (app.has_workspace_role(workspace_id, 'owner'))
  with check (app.has_workspace_role(workspace_id, 'owner') and role <> 'owner');
-- Owners remove members; any member may leave. The owner row is protected by trigger.
create policy members_delete on public.workspace_members for delete to authenticated
  using (app.has_workspace_role(workspace_id, 'owner') or user_id = (select auth.uid()));

create policy invitations_select on public.workspace_invitations for select to authenticated
  using (app.has_workspace_role(workspace_id, 'owner'));
create policy invitations_insert on public.workspace_invitations for insert to authenticated
  with check (
    app.has_workspace_role(workspace_id, 'owner')
    and invited_by = (select auth.uid())
    and status = 'pending'
  );
-- The only client-side transition is revoking a pending invitation.
create policy invitations_revoke on public.workspace_invitations for update to authenticated
  using (app.has_workspace_role(workspace_id, 'owner') and status = 'pending')
  with check (app.has_workspace_role(workspace_id, 'owner') and status = 'revoked');

-- ---------------------------------------------------------------------------
-- Policies: workspace-owned domain records (viewer reads, editor writes)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'recruiters', 'opportunities', 'recruiter_calls', 'interviews',
    'questions', 'preparation_tasks', 'follow_up_tasks', 'star_stories', 'shared_notes'
  ]
  loop
    execute format(
      'create policy %1$s_select on public.%1$I for select to authenticated
         using (app.has_workspace_role(workspace_id, ''viewer''))', t);
    execute format(
      'create policy %1$s_insert on public.%1$I for insert to authenticated
         with check (app.has_workspace_role(workspace_id, ''editor''))', t);
    execute format(
      'create policy %1$s_update on public.%1$I for update to authenticated
         using (app.has_workspace_role(workspace_id, ''editor''))
         with check (app.has_workspace_role(workspace_id, ''editor''))', t);
    execute format(
      'create policy %1$s_delete on public.%1$I for delete to authenticated
         using (app.has_workspace_role(workspace_id, ''editor''))', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Policies: recordings, comments, activity
-- ---------------------------------------------------------------------------

-- Every member sees recording metadata. Playback (signed URLs) is authorized
-- separately on the server for owner/editor only (decision D4, Phase 5).
create policy recordings_select on public.recordings for select to authenticated
  using (app.has_workspace_role(workspace_id, 'viewer'));
create policy recordings_insert on public.recordings for insert to authenticated
  with check (
    app.has_workspace_role(workspace_id, 'editor')
    and uploaded_by = (select auth.uid())
    and status = 'pending'
  );
create policy recordings_update on public.recordings for update to authenticated
  using (app.has_workspace_role(workspace_id, 'editor'))
  with check (app.has_workspace_role(workspace_id, 'editor'));

create policy comments_select on public.comments for select to authenticated
  using (app.has_workspace_role(workspace_id, 'viewer'));
create policy comments_insert on public.comments for insert to authenticated
  with check (
    app.has_workspace_role(workspace_id, 'commenter')
    and author_id = (select auth.uid())
    and deleted_at is null
  );
-- Authors edit or soft-delete their own comments; owners may soft-delete any comment.
create policy comments_update on public.comments for update to authenticated
  using (
    (author_id = (select auth.uid()) and app.has_workspace_role(workspace_id, 'commenter'))
    or app.has_workspace_role(workspace_id, 'owner')
  )
  with check (
    (author_id = (select auth.uid()) and app.has_workspace_role(workspace_id, 'commenter'))
    or app.has_workspace_role(workspace_id, 'owner')
  );

-- Non-authors (owners moderating) may only set deleted_at; they cannot rewrite text.
create function app.guard_comment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and old.author_id is distinct from (select auth.uid()) then
    if new.body is distinct from old.body or new.edited_at is distinct from old.edited_at then
      raise exception 'Only the author can edit a comment' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_update before update on public.comments
  for each row execute function app.guard_comment_update();

create policy activity_select on public.activity_events for select to authenticated
  using (app.has_workspace_role(workspace_id, 'viewer'));

-- ---------------------------------------------------------------------------
-- Invitation acceptance
-- ---------------------------------------------------------------------------

-- Accepts an invitation for the signed-in user. The raw token is hashed and
-- compared with the stored SHA-256; tokens are single-use, expire, and are bound
-- to the invited email address. Existing members keep their current role.
create function public.accept_invitation(p_token text)
returns table (workspace_id uuid, role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email   extensions.citext;
  v_inv     public.workspace_invitations%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_token is null or char_length(p_token) < 32 or char_length(p_token) > 256 then
    raise exception 'Invitation is invalid or no longer available' using errcode = 'P0002';
  end if;

  select p.email into v_email from public.profiles p where p.id = v_user_id;

  select * into v_inv
  from public.workspace_invitations i
  where i.token_hash = extensions.digest(p_token, 'sha256')
  for update;

  if not found or v_inv.status <> 'pending' or v_inv.expires_at <= now() then
    raise exception 'Invitation is invalid or no longer available' using errcode = 'P0002';
  end if;

  if v_inv.email is distinct from v_email then
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

revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
