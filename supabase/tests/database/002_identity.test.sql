-- Identity and workspace ownership: sign-up bootstrap, owner invariants,
-- cascades and invitation constraints.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

-- Sign-up bootstrap ---------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'avery@example.com', '{"display_name": "Avery Stone"}'),
  ('22222222-2222-2222-2222-222222222222', 'blake.k@example.com', '{}'),
  ('33333333-3333-3333-3333-333333333333', 'casey@example.com', '{}');

select is(
  (select display_name from profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Avery Stone',
  'sign-up creates a profile using display_name metadata'
);
select is(
  (select display_name from profiles where id = '22222222-2222-2222-2222-222222222222'),
  'blake.k',
  'display name falls back to the email local part'
);
select is(
  (select count(*)::int from workspaces where owner_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'sign-up creates exactly one personal workspace'
);
select is(
  (select name from workspaces where owner_id = '11111111-1111-1111-1111-111111111111'),
  'Avery Stone''s workspace',
  'personal workspace is named after the user'
);
select is(
  (select role from workspace_members m join workspaces w on w.id = m.workspace_id
    where w.owner_id = '11111111-1111-1111-1111-111111111111' and m.user_id = w.owner_id),
  'owner',
  'workspace owner is added as an owner member'
);
select is(
  (select count(*)::int from workspace_members m join workspaces w on w.id = m.workspace_id
    where w.owner_id = '11111111-1111-1111-1111-111111111111'),
  1,
  'personal workspace has exactly one member'
);

-- Email sync
update auth.users set email = 'avery.stone@example.com' where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select email::text from profiles where id = '11111111-1111-1111-1111-111111111111'),
  'avery.stone@example.com',
  'profile email follows auth email changes'
);

-- Owner invariants ----------------------------------------------------------
insert into workspaces (id, name, owner_id)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Shared search', '11111111-1111-1111-1111-111111111111');
insert into workspace_members (workspace_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'editor'),
  ('aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'viewer');

select throws_ok(
  $$insert into workspace_members (workspace_id, user_id, role)
    values ('aaaaaaaa-0000-0000-0000-000000000001', gen_random_uuid(), 'viewer')$$,
  '23503', null,
  'members must reference an existing profile'
);
select throws_ok(
  $$update workspace_members set role = 'owner'
    where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001' and user_id = '22222222-2222-2222-2222-222222222222'$$,
  '23505', null,
  'a workspace cannot have two owners'
);
select throws_ok(
  $$update workspace_members set role = 'editor'
    where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001' and user_id = '11111111-1111-1111-1111-111111111111'$$,
  'P0001', null,
  'the owner cannot be demoted directly'
);
select throws_ok(
  $$delete from workspace_members
    where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001' and user_id = '11111111-1111-1111-1111-111111111111'$$,
  'P0001', null,
  'the owner membership cannot be deleted directly'
);
select throws_ok(
  $$update workspace_members set role = 'admin'
    where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001' and user_id = '33333333-3333-3333-3333-333333333333'$$,
  '23514', null,
  'roles are limited to owner/editor/commenter/viewer'
);
select lives_ok(
  $$delete from workspace_members
    where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001' and user_id = '33333333-3333-3333-3333-333333333333'$$,
  'a non-owner member can be removed'
);

-- Ownership transfer order: change owner_id, demote old owner, promote new owner.
select lives_ok(
  $$update workspaces set owner_id = '22222222-2222-2222-2222-222222222222' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
    update workspace_members set role = 'editor'
      where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001' and user_id = '11111111-1111-1111-1111-111111111111';
    update workspace_members set role = 'owner'
      where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001' and user_id = '22222222-2222-2222-2222-222222222222'$$,
  'ownership can move once workspaces.owner_id points to the new owner'
);

-- Invitations ---------------------------------------------------------------
insert into workspace_invitations (workspace_id, email, role, token_hash, invited_by)
values ('aaaaaaaa-0000-0000-0000-000000000001', 'Dana@Example.com', 'commenter',
        extensions.digest('token-1', 'sha256'), '22222222-2222-2222-2222-222222222222');

select throws_ok(
  $$insert into workspace_invitations (workspace_id, email, role, token_hash)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'dana@example.com', 'viewer', extensions.digest('token-2', 'sha256'))$$,
  'P0001', 'This person already has a pending invitation.',
  'only one pending invitation per email per workspace (case-insensitive; the unique index is the backstop)'
);
select throws_ok(
  $$insert into workspace_invitations (workspace_id, email, role, token_hash)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'eve@example.com', 'owner', extensions.digest('token-3', 'sha256'))$$,
  '23514', null,
  'invitations cannot grant the owner role'
);
select throws_ok(
  $$insert into workspace_invitations (workspace_id, email, role, token_hash)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'eve@example.com', 'viewer', '\x00'::bytea)$$,
  '23514', null,
  'token_hash must be a 32-byte SHA-256 digest'
);
select throws_ok(
  $$update workspace_invitations set status = 'accepted' where email = 'dana@example.com'$$,
  '23514', null,
  'an accepted invitation must record accepted_at'
);
select lives_ok(
  $$update workspace_invitations set status = 'revoked' where email = 'dana@example.com';
    insert into workspace_invitations (workspace_id, email, role, token_hash)
    values ('aaaaaaaa-0000-0000-0000-000000000001', 'dana@example.com', 'viewer', extensions.digest('token-4', 'sha256'))$$,
  'a new invitation is allowed once the previous one is no longer pending'
);

-- Cascades --------------------------------------------------------------------
delete from workspaces where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select is(
  (select count(*)::int from workspace_members where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001')
  + (select count(*)::int from workspace_invitations where workspace_id = 'aaaaaaaa-0000-0000-0000-000000000001'),
  0,
  'deleting a workspace removes its members and invitations (owner guard allows cascade)'
);

delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*)::int from profiles where id = '11111111-1111-1111-1111-111111111111')
  + (select count(*)::int from workspaces where owner_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'deleting an auth user removes the profile and the workspaces they own'
);
select is(
  (select count(*)::int from workspaces where owner_id = '22222222-2222-2222-2222-222222222222'),
  1,
  'other users'' workspaces are untouched'
);

select * from finish();
rollback;
