-- Phase 4: transactional application operations.
--
-- All functions are SECURITY INVOKER: they run with the caller's privileges, so
-- RLS and column grants apply exactly as for direct table access. They exist to
-- make multi-record writes atomic (one transaction per call).
--
-- Partial updates use jsonb_populate_record(<existing row>, <patch>): only keys
-- present in the patch change; everything else keeps its current value.

-- Finds a company by case-insensitive name in the workspace, creating it if needed.
create function app.resolve_company(p_workspace_id uuid, p_name text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_name text := trim(p_name);
  v_id uuid;
begin
  if v_name is null or v_name = '' then
    raise exception 'Company name is required' using errcode = '22023';
  end if;

  select c.id into v_id from public.companies c
  where c.workspace_id = p_workspace_id and lower(c.name) = lower(v_name);

  if v_id is null then
    insert into public.companies (workspace_id, name)
    values (p_workspace_id, v_name)
    on conflict (workspace_id, lower(name)) do nothing
    returning id into v_id;

    if v_id is null then  -- created concurrently
      select c.id into v_id from public.companies c
      where c.workspace_id = p_workspace_id and lower(c.name) = lower(v_name);
    end if;
  end if;

  return v_id;
end;
$$;

-- Creates (p_recruiter_id null) or partially updates a recruiter.
create function app.apply_recruiter(p_workspace_id uuid, p_recruiter_id uuid, p_data jsonb, p_default_company_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_recruiter_id is null then
    insert into public.recruiters (workspace_id, company_id, name, email, phone, agency)
    select p_workspace_id,
           case when p_data ? 'company_id' then r.company_id else p_default_company_id end,
           r.name, r.email, r.phone, r.agency
    from jsonb_populate_record(null::public.recruiters, p_data) r
    returning id into v_id;
  else
    update public.recruiters t
    set (company_id, name, email, phone, agency) =
        (select r.company_id, r.name, r.email, r.phone, r.agency
         from jsonb_populate_record(t, p_data) r)
    where t.id = p_recruiter_id and t.workspace_id = p_workspace_id
    returning t.id into v_id;

    if v_id is null then
      raise exception 'Recruiter not found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;

-- Creates (p_opportunity_id null) or partially updates an opportunity.
-- p_data may contain company_name (find-or-create) instead of company_id.
create function app.apply_opportunity(p_workspace_id uuid, p_opportunity_id uuid, p_data jsonb, p_recruiter_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
  v_id uuid;
begin
  if v_data ? 'company_name' then
    v_data := (v_data - 'company_name')
      || jsonb_build_object('company_id', app.resolve_company(p_workspace_id, v_data ->> 'company_name'));
  end if;

  if p_opportunity_id is null then
    insert into public.opportunities (
      workspace_id, company_id, recruiter_id, title, location, work_mode, employment_type,
      comp_min, comp_max, comp_currency, comp_period, stage, job_description,
      required_skills, preferred_skills, prep_notes, created_by)
    select p_workspace_id, r.company_id,
           case when v_data ? 'recruiter_id' then r.recruiter_id else p_recruiter_id end,
           r.title, coalesce(r.location, ''), r.work_mode, r.employment_type,
           r.comp_min, r.comp_max, coalesce(r.comp_currency, 'USD'), r.comp_period,
           coalesce(r.stage, 'new'), coalesce(r.job_description, ''),
           coalesce(r.required_skills, '{}'), coalesce(r.preferred_skills, '{}'),
           coalesce(r.prep_notes, ''), (select auth.uid())
    from jsonb_populate_record(null::public.opportunities, v_data) r
    returning id into v_id;
  else
    update public.opportunities t
    set (company_id, recruiter_id, title, location, work_mode, employment_type,
         comp_min, comp_max, comp_currency, comp_period, stage, job_description,
         required_skills, preferred_skills, prep_notes) =
        (select r.company_id, r.recruiter_id, r.title, r.location, r.work_mode, r.employment_type,
                r.comp_min, r.comp_max, r.comp_currency, r.comp_period, r.stage, r.job_description,
                r.required_skills, r.preferred_skills, r.prep_notes
         from jsonb_populate_record(t, v_data) r)
    where t.id = p_opportunity_id and t.workspace_id = p_workspace_id
    returning t.id into v_id;

    if v_id is null then
      raise exception 'Opportunity not found' using errcode = 'P0002';
    end if;
  end if;
  return v_id;
end;
$$;

-- Applies a recruiter reference: absent key → keep, null → none, {id[, update]} → existing
-- (optionally edited), {create} → new recruiter for p_company_id.
create function app.resolve_recruiter_ref(p_workspace_id uuid, p_ref jsonb, p_company_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_ref is null or jsonb_typeof(p_ref) = 'null' then
    return null;
  elsif p_ref ? 'create' then
    return app.apply_recruiter(p_workspace_id, null, p_ref -> 'create', p_company_id);
  elsif p_ref ? 'update' then
    return app.apply_recruiter(p_workspace_id, (p_ref ->> 'id')::uuid, p_ref -> 'update', null);
  else
    perform 1 from public.recruiters r
    where r.id = (p_ref ->> 'id')::uuid and r.workspace_id = p_workspace_id;
    if not found then
      raise exception 'Recruiter not found' using errcode = 'P0002';
    end if;
    return (p_ref ->> 'id')::uuid;
  end if;
end;
$$;

-- Opportunity create/update with optional inline recruiter, in one transaction.
-- p_payload: { "opportunity": {...fields, company_id | company_name},
--              "recruiter": null | {"id"} | {"id","update"} | {"create"} (optional) }
create function public.save_opportunity(p_workspace_id uuid, p_opportunity_id uuid, p_payload jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_data jsonb := coalesce(p_payload -> 'opportunity', '{}'::jsonb);
  v_company_id uuid;
  v_recruiter_id uuid;
begin
  if p_payload ? 'recruiter' then
    -- The recruiter belongs to the opportunity's company.
    if v_data ? 'company_name' then
      v_company_id := app.resolve_company(p_workspace_id, v_data ->> 'company_name');
      v_data := (v_data - 'company_name') || jsonb_build_object('company_id', v_company_id);
    elsif v_data ? 'company_id' then
      v_company_id := (v_data ->> 'company_id')::uuid;
    else
      select o.company_id into v_company_id from public.opportunities o
      where o.id = p_opportunity_id and o.workspace_id = p_workspace_id;
    end if;
    v_recruiter_id := app.resolve_recruiter_ref(p_workspace_id, p_payload -> 'recruiter', v_company_id);
    v_data := v_data || jsonb_build_object('recruiter_id', v_recruiter_id);
  end if;

  return app.apply_opportunity(p_workspace_id, p_opportunity_id, v_data, null);
end;
$$;

-- Recruiter call create/update with linked opportunity, recruiter and follow-up,
-- all in one transaction.
-- p_payload:
--   "opportunity": {"id"} | {"id","update"} | {"create": {...}}   (required on create)
--   "recruiter":   null | {"id"} | {"id","update"} | {"create"}   (optional)
--   "call":        {...recruiter_calls columns}                    (complete on create, partial on update)
--   "follow_up":   null (remove) | {"title","due_date"}            (optional; absent = unchanged)
-- Returns {"call_id","opportunity_id","recruiter_id","company_id","follow_up_id"}.
create function public.save_recruiter_call(p_workspace_id uuid, p_call_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_existing public.recruiter_calls%rowtype;
  v_opp_ref jsonb := p_payload -> 'opportunity';
  v_call jsonb := coalesce(p_payload -> 'call', '{}'::jsonb);
  v_opportunity_id uuid;
  v_company_id uuid;
  v_recruiter_id uuid;
  v_call_id uuid;
  v_follow_up_id uuid;
begin
  if p_call_id is not null then
    select * into v_existing from public.recruiter_calls c
    where c.id = p_call_id and c.workspace_id = p_workspace_id
    for update;
    if not found then
      raise exception 'Recruiter call not found' using errcode = 'P0002';
    end if;
  elsif v_opp_ref is null then
    raise exception 'An opportunity is required' using errcode = '22023';
  end if;

  -- 1. Opportunity (and its company)
  if v_opp_ref is null then
    v_opportunity_id := v_existing.opportunity_id;
  elsif v_opp_ref ? 'create' then
    v_opportunity_id := public.save_opportunity(
      p_workspace_id, null,
      jsonb_build_object('opportunity',
        jsonb_build_object('stage', 'recruiter_screen') || (v_opp_ref -> 'create')));
  else
    v_opportunity_id := (v_opp_ref ->> 'id')::uuid;
    if v_opp_ref ? 'update' then
      perform app.apply_opportunity(p_workspace_id, v_opportunity_id, v_opp_ref -> 'update', null);
    else
      perform 1 from public.opportunities o
      where o.id = v_opportunity_id and o.workspace_id = p_workspace_id;
      if not found then
        raise exception 'Opportunity not found' using errcode = 'P0002';
      end if;
    end if;
  end if;

  select o.company_id into v_company_id from public.opportunities o where o.id = v_opportunity_id;

  -- 2. Recruiter
  if p_payload ? 'recruiter' then
    v_recruiter_id := app.resolve_recruiter_ref(p_workspace_id, p_payload -> 'recruiter', v_company_id);
    -- A new opportunity created from this call is associated with the same recruiter.
    if v_opp_ref ? 'create' and v_recruiter_id is not null then
      update public.opportunities set recruiter_id = v_recruiter_id where id = v_opportunity_id;
    end if;
  else
    v_recruiter_id := v_existing.recruiter_id;
  end if;

  v_call := v_call || jsonb_build_object('opportunity_id', v_opportunity_id, 'recruiter_id', v_recruiter_id);

  -- 3. Call
  if p_call_id is null then
    insert into public.recruiter_calls (
      workspace_id, opportunity_id, recruiter_id, call_at, duration_minutes,
      hiring_manager_priorities, interview_stages, recruiter_advice, technical_topics,
      behavioral_themes, red_flags, candidate_questions, interest_level, notes, created_by)
    select p_workspace_id, r.opportunity_id, r.recruiter_id, r.call_at, r.duration_minutes,
           coalesce(r.hiring_manager_priorities, '{}'), coalesce(r.interview_stages, '{}'),
           coalesce(r.recruiter_advice, ''), coalesce(r.technical_topics, '{}'),
           coalesce(r.behavioral_themes, '{}'), coalesce(r.red_flags, '{}'),
           coalesce(r.candidate_questions, '[]'::jsonb), r.interest_level,
           coalesce(r.notes, ''), (select auth.uid())
    from jsonb_populate_record(null::public.recruiter_calls, v_call) r
    returning id into v_call_id;
  else
    update public.recruiter_calls t
    set (opportunity_id, recruiter_id, call_at, duration_minutes, hiring_manager_priorities,
         interview_stages, recruiter_advice, technical_topics, behavioral_themes, red_flags,
         candidate_questions, interest_level, notes) =
        (select r.opportunity_id, r.recruiter_id, r.call_at, r.duration_minutes, r.hiring_manager_priorities,
                r.interview_stages, r.recruiter_advice, r.technical_topics, r.behavioral_themes, r.red_flags,
                r.candidate_questions, r.interest_level, r.notes
         from jsonb_populate_record(t, v_call) r)
    where t.id = p_call_id
    returning t.id into v_call_id;
  end if;

  -- 4. Follow-up ("next action")
  if p_payload ? 'follow_up' then
    if jsonb_typeof(p_payload -> 'follow_up') = 'null' then
      delete from public.follow_up_tasks where recruiter_call_id = v_call_id;
    else
      insert into public.follow_up_tasks (workspace_id, opportunity_id, recruiter_call_id, title, due_date, created_by)
      values (p_workspace_id, v_opportunity_id, v_call_id,
              p_payload -> 'follow_up' ->> 'title',
              (p_payload -> 'follow_up' ->> 'due_date')::date,
              (select auth.uid()))
      on conflict (recruiter_call_id) do update
        set title = excluded.title, due_date = excluded.due_date, opportunity_id = excluded.opportunity_id;
    end if;
  end if;

  select f.id into v_follow_up_id from public.follow_up_tasks f where f.recruiter_call_id = v_call_id;

  return jsonb_build_object(
    'call_id', v_call_id,
    'opportunity_id', v_opportunity_id,
    'recruiter_id', v_recruiter_id,
    'company_id', v_company_id,
    'follow_up_id', v_follow_up_id);
end;
$$;

revoke all on function app.resolve_company(uuid, text) from public, anon;
revoke all on function app.apply_recruiter(uuid, uuid, jsonb, uuid) from public, anon;
revoke all on function app.apply_opportunity(uuid, uuid, jsonb, uuid) from public, anon;
revoke all on function app.resolve_recruiter_ref(uuid, jsonb, uuid) from public, anon;
revoke all on function public.save_opportunity(uuid, uuid, jsonb) from public, anon;
revoke all on function public.save_recruiter_call(uuid, uuid, jsonb) from public, anon;

grant execute on function app.resolve_company(uuid, text) to authenticated;
grant execute on function app.apply_recruiter(uuid, uuid, jsonb, uuid) to authenticated;
grant execute on function app.apply_opportunity(uuid, uuid, jsonb, uuid) to authenticated;
grant execute on function app.resolve_recruiter_ref(uuid, jsonb, uuid) to authenticated;
grant execute on function public.save_opportunity(uuid, uuid, jsonb) to authenticated;
grant execute on function public.save_recruiter_call(uuid, uuid, jsonb) to authenticated;
