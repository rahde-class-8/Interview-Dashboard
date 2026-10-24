-- Interview intelligence: interviews, questions, preparation tasks,
-- follow-up tasks and STAR stories.

create table public.interviews (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null,
  opportunity_id    uuid not null,
  title             text not null check (char_length(trim(title)) between 1 and 200),
  stage             text not null check (stage in ('recruiter_screen', 'technical', 'hiring_manager', 'offer')),
  scheduled_at      timestamptz not null,
  duration_minutes  integer not null check (duration_minutes between 1 and 1440),
  format            text not null check (format in ('video', 'phone', 'onsite')),
  interviewers      text[] not null default '{}' check (cardinality(interviewers) <= 20),
  status            text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled', 'rescheduled')),
  outcome           text not null default 'pending' check (outcome in ('pending', 'advanced', 'rejected', 'offer')),
  notes             text not null default '' check (char_length(notes) <= 10000),
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  foreign key (opportunity_id, workspace_id)
    references public.opportunities (id, workspace_id) on delete cascade
);
create index interviews_workspace_time_idx on public.interviews (workspace_id, scheduled_at);
create index interviews_opportunity_idx on public.interviews (opportunity_id);

create table public.questions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  company_id    uuid,
  type          text not null check (type in ('technical', 'behavioral')),
  topic         text not null check (char_length(trim(topic)) between 1 and 80),
  difficulty    text not null check (difficulty in ('easy', 'medium', 'hard')),
  question      text not null check (char_length(trim(question)) between 1 and 2000),
  answer_notes  text not null default '' check (char_length(answer_notes) <= 20000),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  foreign key (company_id, workspace_id)
    references public.companies (id, workspace_id) on delete set null (company_id)
);
create index questions_workspace_filter_idx on public.questions (workspace_id, type, topic);
create index questions_company_idx on public.questions (company_id);

create table public.preparation_tasks (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null,
  opportunity_id  uuid not null,
  title           text not null check (char_length(trim(title)) between 1 and 300),
  category        text not null check (category in ('technical', 'behavioral', 'research', 'logistics')),
  due_date        date,
  completed_at    timestamptz,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (opportunity_id, workspace_id)
    references public.opportunities (id, workspace_id) on delete cascade
);
create index preparation_tasks_opportunity_idx on public.preparation_tasks (opportunity_id);
create index preparation_tasks_open_idx on public.preparation_tasks (workspace_id, due_date) where completed_at is null;

create table public.follow_up_tasks (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null,
  opportunity_id     uuid not null,
  recruiter_call_id  uuid unique,  -- a call's "next action" is at most one follow-up
  title              text not null check (char_length(trim(title)) between 1 and 300),
  due_date           date not null,
  completed_at       timestamptz,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  foreign key (opportunity_id, workspace_id)
    references public.opportunities (id, workspace_id) on delete cascade,
  foreign key (recruiter_call_id, workspace_id)
    references public.recruiter_calls (id, workspace_id) on delete cascade
);
create index follow_up_tasks_opportunity_idx on public.follow_up_tasks (opportunity_id);
create index follow_up_tasks_open_idx on public.follow_up_tasks (workspace_id, due_date) where completed_at is null;

-- A follow-up created from a call must belong to that call's opportunity.
create function app.check_follow_up_call_opportunity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.recruiter_call_id is not null and not exists (
    select 1 from public.recruiter_calls c
    where c.id = new.recruiter_call_id and c.opportunity_id = new.opportunity_id
  ) then
    raise exception 'Follow-up task call % does not belong to opportunity %', new.recruiter_call_id, new.opportunity_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_call_opportunity before insert or update of recruiter_call_id, opportunity_id on public.follow_up_tasks
  for each row execute function app.check_follow_up_call_opportunity();

-- Moving a call to another opportunity must not orphan its follow-up's linkage.
create function app.sync_follow_up_on_call_move()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.opportunity_id is distinct from old.opportunity_id then
    update public.follow_up_tasks set opportunity_id = new.opportunity_id
    where recruiter_call_id = new.id;
  end if;
  return new;
end;
$$;

create trigger sync_follow_up_opportunity after update of opportunity_id on public.recruiter_calls
  for each row execute function app.sync_follow_up_on_call_move();

create table public.star_stories (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  title         text not null check (char_length(trim(title)) between 1 and 200),
  situation     text not null default '' check (char_length(situation) <= 5000),
  task          text not null default '' check (char_length(task) <= 5000),
  action        text not null default '' check (char_length(action) <= 5000),
  result        text not null default '' check (char_length(result) <= 5000),
  themes        text[] not null default '{}' check (cardinality(themes) <= 20),
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index star_stories_workspace_idx on public.star_stories (workspace_id, updated_at desc);

create trigger set_updated_at before update on public.interviews
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.questions
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.preparation_tasks
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.follow_up_tasks
  for each row execute function app.set_updated_at();
create trigger set_updated_at before update on public.star_stories
  for each row execute function app.set_updated_at();

alter table public.interviews enable row level security;
alter table public.interviews force row level security;
alter table public.questions enable row level security;
alter table public.questions force row level security;
alter table public.preparation_tasks enable row level security;
alter table public.preparation_tasks force row level security;
alter table public.follow_up_tasks enable row level security;
alter table public.follow_up_tasks force row level security;
alter table public.star_stories enable row level security;
alter table public.star_stories force row level security;
