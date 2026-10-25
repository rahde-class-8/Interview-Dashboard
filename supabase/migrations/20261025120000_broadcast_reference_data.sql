-- Phase 7: also notify members when reference data changes, so every page of the
-- client stays in sync (same id-only payloads as 20261025100000).
do $$
declare
  t text;
begin
  foreach t in array array['companies', 'recruiters', 'questions', 'star_stories']
  loop
    execute format(
      'create trigger broadcast after insert or update or delete on public.%I
         for each row execute function app.broadcast_change()', t);
  end loop;
end;
$$;
