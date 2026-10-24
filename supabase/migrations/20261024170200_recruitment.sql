-- Recruitment: companies, recruiters, opportunities, recruiter calls.
-- Child tables reference parents with composite (id, workspace_id) foreign keys so
-- a record can never point at a record in a different workspace.

create table public.companies (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  name          text not null check (char_length(trim(name)) between 1 and 200),
  industry      text check (char_length(industry) <= 120),
  headquarters  text check (char_length(headquarters) <= 120),
  website       text check (website ~* '^https?://' and char_length(website) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, workspace_id)
);
create unique index companies_name_per_workspace on public.companies (workspace_id, lower(name));

create table public.recruiters (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  company_id    uuid,
  name          text not null check (char_length(trim(name)) between 1 and 120),
  email         extensions.citext check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone         text check (char_length(phone) <= 40),
  agency        text check (char_length(agency) <= 120),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (company_id, workspace_id)
    references public.companies (id, workspace_id) on delete set null (company_id)
);
create index recruiters_workspace_name_idx on public.recruiters (workspace_id, name);
create index recruiters_company_idx on public.recruiters (company_id);

create table public.opportunities (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  company_id        uuid not null,
  recruiter_id      uuid,
  title             text not null check (char_length(trim(title)) between 1 and 200),
  location          text not null default '' check (char_length(location) <= 200),
  work_mode         text not null check (work_mode in ('remote', 'hybrid', 'onsite')),
  employment_type   text not null check (employment_type in ('full_time', 'contract', 'contract_to_hire', 'part_time')),
  comp_min          numeric(12, 2) check (comp_min >= 0),
  comp_max          numeric(12, 2),
  comp_currency     char(3) not null default 'USD' check (comp_currency ~ '^[A-Z]{3}$'),
  comp_period       text check (comp_period in ('year', 'hour')),
  stage             text not null default 'new'
                    check (stage in ('new', 'recruiter_screen', 'technical', 'hiring_manager', 'offer', 'closed')),
  stage_changed_at  timestamptz not null default now(),
  job_description   text not null default '' check (char_length(job_description) <= 20000),
  required_skills   text[] not null default '{}' check (cardinality(required_skills) <= 50),
  preferred_skills  text[] not null default '{}' check (cardinality(preferred_skills) <= 50),
  prep_notes        text not null default '' check (char_length(prep_notes) <= 20000),
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, workspace_id),
  -- NO ACTION (checked at statement end) blocks deleting a referenced company just like
  -- RESTRICT, but lets a workspace delete cascade regardless of trigger order.
  foreign key (company_id, workspace_id)
    references public.companies (id, workspace_id) on delete no action,
  foreign key (recruiter_id, workspace_id)
    references public.recruiters (id, workspace_id) on delete set null (recruiter_id),
  -- Compensation is all-or-nothing and max >= min.
  constraint opportunities_comp_complete check (
    (comp_min is null and comp_max is null and comp_period is null)
    or (comp_min is not null and comp_max is not null and comp_period is not null)
  ),
  constraint opportunities_comp_range check (comp_max is null or comp_max >= comp_min)
);
create index opportunities_workspace_stage_idx on public.opportunities (workspace_id, stage, updated_at desc);
create index opportunities_workspace_updated_idx on public.opportunities (workspace_id, updated_at desc);
create index opportunities_company_idx on public.opportunities (company_id);
create index opportunities_recruiter_idx on public.opportunities (recruiter_id);

-- Validates the candidate Q&A array stored on a call:
-- [{ "question": text (1..2000), "answer": text (0..5000) }, ...] with at most 30 items.
create function app.valid_candidate_questions(items jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(items) = 'array'
     and jsonb_array_length(items) <= 30
     and not exists (
       select 1 from jsonb_array_elements(items) e
       where jsonb_typeof(e) <> 'object'
          or jsonb_typeof(e -> 'question') <> 'string'
          or char_length(e ->> 'question') not between 1 and 2000
          or (e ? 'answer' and (jsonb_typeof(e -> 'answer') <> 'string' or char_length(e ->> 'answer') > 5000))
          or exists (select 1 from jsonb_object_keys(e) k where k not in ('question', 'answer'))
     );
$$;

-- Used by a CHECK constraint, so roles that write calls must be able to execute it.
grant usage on schema app to authenticated;
grant execute on function app.valid_candidate_questions(jsonb) to authenticated, service_role;

create table public.recruiter_calls (
  id                         uuid primary key default gen_random_uuid(),
  workspace_id               uuid not null references public.workspaces (id) on delete cascade,
  opportunity_id             uuid not null,
  recruiter_id               uuid,
  call_at                    timestamptz not null,
  duration_minutes           integer not null check (duration_minutes between 1 and 600),
  hiring_manager_priorities  text[] not null default '{}' check (cardinality(hiring_manager_priorities) <= 50),
  interview_stages           text[] not null default '{}' check (cardinality(interview_stages) <= 30),
  recruiter_advice           text not null default '' check (char_length(recruiter_advice) <= 10000),
  technical_topics           text[] not null default '{}' check (cardinality(technical_topics) <= 50),
  behavioral_themes          text[] not null default '{}' check (cardinality(behavioral_themes) <= 50),
  red_flags                  text[] not null default '{}' check (cardinality(red_flags) <= 50),
  candidate_questions        jsonb not null default '[]'::jsonb check (app.valid_candidate_questions(candidate_questions)),
  interest_level             smallint not null check (interest_level between 1 and 10),
  notes                      text not null default '' check (char_length(notes) <= 100000),
  created_by                 uuid references public.profiles (id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (id, workspace_id),
  foreign key (opportunity_id, workspace_id)
    references public.opportunities (id, workspace_id) on delete cascade,
  foreign key (recruiter_id, workspace_id)
    references public.recruiters (id, workspace_id) on delete set null (recruiter_id)
);
create index recruiter_calls_workspace_time_idx on public.recruiter_calls (workspace_id, call_at desc);
create index recruiter_calls_opportunity_idx on public.recruiter_calls (opportunity_id);
create index recruiter_calls_recruiter_idx on public.recruiter_calls (recruiter_id);

-- Record when the pipeline stage changes.
create function app.track_stage_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger track_stage_change before update of stage on public.opportunities
  for each row execute function app.track_stage_change();

create trigger set_updated_at before update on public.companies
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.recruiters
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.opportunities
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.recruiter_calls
  for each row execute function app.set_updated_at();

alter table public.companies enable row level security;
alter table public.companies force row level security;
alter table public.recruiters enable row level security;
alter table public.recruiters force row level security;
alter table public.opportunities enable row level security;
alter table public.opportunities force row level security;
alter table public.recruiter_calls enable row level security;
alter table public.recruiter_calls force row level security;
