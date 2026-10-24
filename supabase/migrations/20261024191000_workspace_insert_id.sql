-- Allow clients (the API server acting as the user) to supply the id of a new
-- workspace. INSERT … RETURNING on workspaces is evaluated against the SELECT
-- policy before the owner membership (AFTER INSERT trigger) is visible, so the
-- API inserts with a server-generated UUID and reads the row back.
grant insert (id) on public.workspaces to authenticated;
