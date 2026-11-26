-- ============================================================================
-- 0005 — Busy Me: guardas + RPC de estado y cronómetros
-- El cliente NUNCA hace update directo de tasks.status/started_at/completed_at ni toca
-- time_entries abiertos (ended_at null): lo imponen dos triggers que solo dejan pasar cuando
-- la transacción corre dentro de una RPC (set_config('busy_me.via_rpc') transaccional).
-- Las RPC son SECURITY INVOKER: la RLS del usuario sigue aplicando dentro de ellas.
-- Idempotente.
-- ============================================================================

create or replace function public.via_rpc()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(current_setting('busy_me.via_rpc', true), '') = '1';
$$;
revoke all on function public.via_rpc() from public;
-- Solo la usan los triggers (corren con el rol de quien escribe) y las RPC.
grant execute on function public.via_rpc() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Guarda de tasks
-- ----------------------------------------------------------------------------
create or replace function public.tasks_guard_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.via_rpc() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status <> 'backlog' or new.started_at is not null or new.completed_at is not null then
      raise exception 'tasks: status, started_at y completed_at solo cambian a través de las RPC (start_task, activate_task, complete_task, reopen_task)'
        using errcode = 'P0001';
    end if;
  elsif new.status is distinct from old.status
     or new.started_at is distinct from old.started_at
     or new.completed_at is distinct from old.completed_at then
    raise exception 'tasks: status, started_at y completed_at solo cambian a través de las RPC (start_task, activate_task, complete_task, reopen_task)'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_tasks_guard_status on public.tasks;
create trigger trg_tasks_guard_status
  before insert or update on public.tasks
  for each row execute function public.tasks_guard_status();

-- ----------------------------------------------------------------------------
-- Guarda de time_entries: abrir o cerrar un tramo solo por RPC. Los tramos cerrados se
-- pueden insertar (entrada manual), editar y borrar directamente desde el detalle.
-- ----------------------------------------------------------------------------
create or replace function public.time_entries_guard_open()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if public.via_rpc() then
    return new;
  end if;
  if tg_op = 'INSERT' and new.ended_at is null then
    raise exception 'time_entries: un tramo abierto solo se crea con activate_task' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and (old.ended_at is null or new.ended_at is null) then
    raise exception 'time_entries: un tramo abierto solo se modifica con pause_task, pause_all o complete_task' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_time_entries_guard_open on public.time_entries;
create trigger trg_time_entries_guard_open
  before insert or update on public.time_entries
  for each row execute function public.time_entries_guard_open();

-- ----------------------------------------------------------------------------
-- Helpers internos de las RPC
-- ----------------------------------------------------------------------------
-- Bloquea la tarea del usuario (RLS aplica: si no es suya, "not found").
create or replace function public.lock_own_task(p_task_id uuid)
returns public.tasks
language plpgsql
set search_path = public, pg_temp
as $$
declare
  t public.tasks;
begin
  select * into t from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'task not found' using errcode = 'P0002';
  end if;
  return t;
end;
$$;
revoke all on function public.lock_own_task(uuid) from public;
grant execute on function public.lock_own_task(uuid) to authenticated, service_role;

-- Cierra los tramos abiertos de una tarea (o de todas si p_task_id es null). Devuelve cuántos.
-- ended_at nunca iguala a started_at (check): en la misma transacción now() no avanza.
create or replace function public.close_open_entries(p_task_id uuid)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  update public.time_entries
     set ended_at = greatest(now(), started_at + interval '1 second')
   where ended_at is null
     and (p_task_id is null or task_id = p_task_id);
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.close_open_entries(uuid) from public;
grant execute on function public.close_open_entries(uuid) to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- RPC públicas (PostgREST: supabase.rpc('activate_task', { p_task_id }))
-- ----------------------------------------------------------------------------

-- start_task: backlog → started (started_at = now()). No abre cronómetro. Idempotente si ya
-- está started. Error si done/cancelled.
create or replace function public.start_task(p_task_id uuid)
returns public.tasks
language plpgsql
set search_path = public, pg_temp
as $$
declare
  t public.tasks;
begin
  perform set_config('busy_me.via_rpc', '1', true);
  t := public.lock_own_task(p_task_id);
  if t.status = 'backlog' then
    update public.tasks set status = 'started', started_at = now() where id = t.id returning * into t;
  elsif t.status <> 'started' then
    raise exception 'task is % and cannot be started', t.status using errcode = 'P0001';
  end if;
  perform set_config('busy_me.via_rpc', '', true);
  return t;
end;
$$;

-- activate_task: si backlog → started; si ya tiene tramo abierto no hace nada; si no, abre
-- uno. No toca otras tareas. Error si done/cancelled.
create or replace function public.activate_task(p_task_id uuid)
returns public.tasks
language plpgsql
set search_path = public, pg_temp
as $$
declare
  t public.tasks;
begin
  perform set_config('busy_me.via_rpc', '1', true);
  t := public.lock_own_task(p_task_id);
  if t.status in ('done', 'cancelled') then
    raise exception 'task is % and cannot be activated', t.status using errcode = 'P0001';
  end if;
  if t.status = 'backlog' then
    update public.tasks set status = 'started', started_at = now() where id = t.id returning * into t;
  end if;
  if not exists (select 1 from public.time_entries where task_id = t.id and ended_at is null) then
    insert into public.time_entries (user_id, task_id, started_at) values (t.user_id, t.id, now());
  end if;
  perform set_config('busy_me.via_rpc', '', true);
  return t;
end;
$$;

-- pause_task: cierra el tramo abierto de esa tarea (0 o 1). Devuelve cuántos cerró.
create or replace function public.pause_task(p_task_id uuid)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  perform set_config('busy_me.via_rpc', '1', true);
  perform public.lock_own_task(p_task_id);
  n := public.close_open_entries(p_task_id);
  perform set_config('busy_me.via_rpc', '', true);
  return n;
end;
$$;

-- pause_all: cierra todos los tramos abiertos del usuario. Devuelve cuántos cerró.
create or replace function public.pause_all()
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  perform set_config('busy_me.via_rpc', '1', true);
  n := public.close_open_entries(null);
  perform set_config('busy_me.via_rpc', '', true);
  return n;
end;
$$;

-- complete_task: cierra su tramo si existe; done, completed_at = now(). Idempotente si ya done.
create or replace function public.complete_task(p_task_id uuid)
returns public.tasks
language plpgsql
set search_path = public, pg_temp
as $$
declare
  t public.tasks;
begin
  perform set_config('busy_me.via_rpc', '1', true);
  t := public.lock_own_task(p_task_id);
  if t.status <> 'done' then
    perform public.close_open_entries(t.id);
    update public.tasks set status = 'done', completed_at = now() where id = t.id returning * into t;
  end if;
  perform set_config('busy_me.via_rpc', '', true);
  return t;
end;
$$;

-- reopen_task: done (o cancelled) → started, completed_at = null.
create or replace function public.reopen_task(p_task_id uuid)
returns public.tasks
language plpgsql
set search_path = public, pg_temp
as $$
declare
  t public.tasks;
begin
  perform set_config('busy_me.via_rpc', '1', true);
  t := public.lock_own_task(p_task_id);
  if t.status not in ('done', 'cancelled') then
    raise exception 'task is % and cannot be reopened', t.status using errcode = 'P0001';
  end if;
  update public.tasks
     set status = 'started', completed_at = null, started_at = coalesce(started_at, now())
   where id = t.id returning * into t;
  perform set_config('busy_me.via_rpc', '', true);
  return t;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['start_task(uuid)', 'activate_task(uuid)', 'pause_task(uuid)', 'pause_all()', 'complete_task(uuid)', 'reopen_task(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
