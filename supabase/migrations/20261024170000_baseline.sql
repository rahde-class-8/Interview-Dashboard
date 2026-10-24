-- Baseline: deny-by-default privileges, extensions, private helper schema and
-- shared trigger functions.

-- Supabase grants anon full privileges on new public tables/functions by default.
-- The app never serves anonymous data, so remove those defaults FIRST (before any
-- object is created). Authenticated access is controlled per table with RLS
-- policies (Phase 3).
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon, public;

-- Functions are never executable by default; grants are added explicitly.
alter default privileges for role postgres revoke execute on functions from public;

create extension if not exists citext with schema extensions;

-- Helper functions live in a schema that is NOT exposed through the Data API
-- (config.toml exposes only "public" and "graphql_public").
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to postgres, service_role;

-- Keep updated_at current on every mutable table.
create function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Belt and braces: nothing in app is executable by PUBLIC/anon.
revoke execute on all functions in schema app from public, anon;
