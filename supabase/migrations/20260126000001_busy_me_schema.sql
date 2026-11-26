-- ============================================================================
-- 20260126000001 — Busy Me: esquema (areas, requesters, work_types, projects, tasks, time_entries)
-- Reglas: toda tabla con RLS por user_id = auth.uid(); user_id lo pone un trigger; grants
-- explícitos (auto_expose_new_tables = false); updated_at por set_updated_at().
-- Zona horaria de negocio: America/Mexico_City (se aplica en vistas y RPC, no aquí).
-- Idempotente.
-- ============================================================================

do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where t.typname = 'task_status' and n.nspname = 'public') then
    create type public.task_status as enum ('backlog', 'started', 'done', 'cancelled');
  end if;
end $$;

-- user_id siempre sale de la sesión. Para el rol postgres (tests, seeds) auth.uid() es null
-- y se respeta el valor dado; para authenticated siempre gana auth.uid().
create or replace function public.set_user_id()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.user_id := coalesce(auth.uid(), new.user_id);
  return new;
end;
$$;
revoke all on function public.set_user_id() from public, anon;
comment on function public.set_user_id() is
  'Trigger BEFORE INSERT: user_id = auth.uid() (o el dado si no hay sesión: tests/seeds). Sin SECURITY DEFINER.';

-- ----------------------------------------------------------------------------
-- areas
-- ----------------------------------------------------------------------------
create table if not exists public.areas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 60),
  color         text not null default '#6366f1' check (color ~ '^#[0-9a-fA-F]{6}$'),
  track_by_type boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists areas_user_idx on public.areas (user_id, sort_order);

-- ----------------------------------------------------------------------------
-- requesters / work_types / projects (catálogos por área)
-- ----------------------------------------------------------------------------
create table if not exists public.requesters (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  area_id    uuid not null references public.areas(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists requesters_area_idx on public.requesters (user_id, area_id);

create table if not exists public.work_types (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  area_id    uuid not null references public.areas(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists work_types_area_idx on public.work_types (user_id, area_id);

create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  area_id    uuid not null references public.areas(id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 120),
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_area_idx on public.projects (user_id, area_id);

-- ----------------------------------------------------------------------------
-- tasks
-- status/started_at/completed_at solo cambian por RPC (trigger guard en 0005).
-- ----------------------------------------------------------------------------
create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  area_id       uuid not null references public.areas(id) on delete restrict,
  project_id    uuid references public.projects(id) on delete set null,
  requester_id  uuid references public.requesters(id) on delete set null,
  work_type_id  uuid references public.work_types(id) on delete set null,
  title         text not null check (length(trim(title)) between 1 and 200),
  notes         text,
  due_date      date,
  priority      smallint not null default 2 check (priority between 1 and 3), -- 1 alta, 2 media, 3 baja
  status        public.task_status not null default 'backlog',
  started_at    timestamptz,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists tasks_user_status_idx on public.tasks (user_id, status);
create index if not exists tasks_user_due_idx on public.tasks (user_id, due_date);
create index if not exists tasks_area_idx on public.tasks (area_id);
create index if not exists tasks_project_idx on public.tasks (project_id);
create index if not exists tasks_requester_idx on public.tasks (requester_id);
create index if not exists tasks_work_type_idx on public.tasks (work_type_id);

-- ----------------------------------------------------------------------------
-- time_entries: un timer abierto como máximo POR TAREA; varias tareas activas a la vez.
-- ----------------------------------------------------------------------------
create table if not exists public.time_entries (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  task_id          uuid not null references public.tasks(id) on delete cascade,
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_seconds integer generated always as (
                     case when ended_at is null then null
                          else floor(extract(epoch from (ended_at - started_at)))::integer end
                   ) stored,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint time_entries_ended_after_started check (ended_at is null or ended_at > started_at)
);
create unique index if not exists time_entries_one_open_per_task
  on public.time_entries (task_id) where ended_at is null;
create index if not exists time_entries_user_started_idx on public.time_entries (user_id, started_at);
create index if not exists time_entries_task_idx on public.time_entries (task_id);

-- ----------------------------------------------------------------------------
-- Triggers: user_id y updated_at en todas
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['areas', 'requesters', 'work_types', 'projects', 'tasks', 'time_entries'] loop
    execute format('drop trigger if exists trg_%1$s_user_id on public.%1$s', t);
    execute format('create trigger trg_%1$s_user_id before insert on public.%1$s for each row execute function public.set_user_id()', t);
    execute format('drop trigger if exists trg_%1$s_updated_at on public.%1$s', t);
    execute format('create trigger trg_%1$s_updated_at before update on public.%1$s for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Grants explícitos + RLS. Cada quien lo suyo. Las referencias (area_id, task_id…) deben ser
-- visibles para el usuario: el subquery corre bajo la RLS de la tabla referenciada, así que
-- no se puede colgar una tarea del área de otro usuario aunque se conozca su uuid.
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['areas', 'requesters', 'work_types', 'projects', 'tasks', 'time_entries'] loop
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('drop policy if exists "%1$s: select own" on public.%1$s', t);
    execute format('create policy "%1$s: select own" on public.%1$s for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('drop policy if exists "%1$s: delete own" on public.%1$s', t);
    execute format('create policy "%1$s: delete own" on public.%1$s for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end $$;

-- RLS explícita por tabla (scripts/check-rls.sh la busca literalmente).
alter table public.areas        enable row level security;
alter table public.requesters   enable row level security;
alter table public.work_types   enable row level security;
alter table public.projects     enable row level security;
alter table public.tasks        enable row level security;
alter table public.time_entries enable row level security;

-- areas: sin referencias
drop policy if exists "areas: insert own" on public.areas;
create policy "areas: insert own" on public.areas for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "areas: update own" on public.areas;
create policy "areas: update own" on public.areas for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- requesters / work_types / projects: area visible
do $$
declare t text;
begin
  foreach t in array array['requesters', 'work_types', 'projects'] loop
    execute format('drop policy if exists "%1$s: insert own" on public.%1$s', t);
    execute format($p$create policy "%1$s: insert own" on public.%1$s for insert to authenticated
      with check ((select auth.uid()) = user_id and exists (select 1 from public.areas a where a.id = area_id))$p$, t);
    execute format('drop policy if exists "%1$s: update own" on public.%1$s', t);
    execute format($p$create policy "%1$s: update own" on public.%1$s for update to authenticated
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id and exists (select 1 from public.areas a where a.id = area_id))$p$, t);
  end loop;
end $$;

-- tasks: área, proyecto, solicitante y tipo visibles (los opcionales, si no son null)
drop policy if exists "tasks: insert own" on public.tasks;
create policy "tasks: insert own" on public.tasks for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.areas a where a.id = area_id)
    and (project_id is null or exists (select 1 from public.projects p where p.id = project_id))
    and (requester_id is null or exists (select 1 from public.requesters r where r.id = requester_id))
    and (work_type_id is null or exists (select 1 from public.work_types w where w.id = work_type_id))
  );
drop policy if exists "tasks: update own" on public.tasks;
create policy "tasks: update own" on public.tasks for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.areas a where a.id = area_id)
    and (project_id is null or exists (select 1 from public.projects p where p.id = project_id))
    and (requester_id is null or exists (select 1 from public.requesters r where r.id = requester_id))
    and (work_type_id is null or exists (select 1 from public.work_types w where w.id = work_type_id))
  );

-- time_entries: tarea visible
drop policy if exists "time_entries: insert own" on public.time_entries;
create policy "time_entries: insert own" on public.time_entries for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (select 1 from public.tasks t where t.id = task_id));
drop policy if exists "time_entries: update own" on public.time_entries;
create policy "time_entries: update own" on public.time_entries for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.tasks t where t.id = task_id));

comment on table public.tasks is 'Tareas del usuario. status/started_at/completed_at solo cambian por RPC.';
comment on table public.time_entries is 'Tramos de tiempo por tarea. Máximo un tramo abierto (ended_at null) por tarea; varias tareas en paralelo sí.';
