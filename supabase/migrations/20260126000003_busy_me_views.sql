-- ============================================================================
-- 20260126000003 — Busy Me: vistas de tablero y reparto de tiempo + Realtime
-- Zona horaria de negocio: America/Mexico_City.
-- Ambas vistas son security_invoker: la RLS del usuario aplica a las tablas base.
-- Idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- v_time_allocated: reparte el tiempo trabajado en paralelo.
-- Fronteras = inicios y fines de todos los tramos del usuario (los abiertos cuentan hasta
-- now()) + las medianoches de America/Mexico_City que cruza cada tramo. En cada segmento hay
-- N tramos activos; cada uno recibe duración/N. Solo window functions y agregados, sin loops.
-- Salida: una fila por (time_entry_id, day) con clock_seconds y allocated_seconds.
-- ----------------------------------------------------------------------------
create or replace view public.v_time_allocated
with (security_invoker = true)
as
with e as (
  select id, user_id, task_id, started_at, coalesce(ended_at, now()) as ended_at
    from public.time_entries
   where coalesce(ended_at, now()) > started_at
),
bounds as (
  select user_id, started_at as t from e
  union
  select user_id, ended_at from e
  union
  select e.user_id, (d + interval '1 day') at time zone 'America/Mexico_City'
    from e
    cross join lateral generate_series(
      date_trunc('day', e.started_at at time zone 'America/Mexico_City'),
      date_trunc('day', e.ended_at   at time zone 'America/Mexico_City') - interval '1 day',
      interval '1 day'
    ) as d
),
segs as (
  select user_id, t as seg_start, lead(t) over (partition by user_id order by t) as seg_end
    from bounds
),
seg_n as (
  select s.user_id, s.seg_start, s.seg_end, count(*) as n
    from segs s
    join e on e.user_id = s.user_id and e.started_at <= s.seg_start and e.ended_at >= s.seg_end
   where s.seg_end is not null and s.seg_end > s.seg_start
   group by s.user_id, s.seg_start, s.seg_end
)
select e.id       as time_entry_id,
       e.task_id,
       e.user_id,
       (s.seg_start at time zone 'America/Mexico_City')::date as day,
       sum(extract(epoch from (s.seg_end - s.seg_start)))::integer           as clock_seconds,
       round(sum(extract(epoch from (s.seg_end - s.seg_start)) / s.n))::integer as allocated_seconds
  from e
  join seg_n s on s.user_id = e.user_id and e.started_at <= s.seg_start and e.ended_at >= s.seg_end
 group by e.id, e.task_id, e.user_id, (s.seg_start at time zone 'America/Mexico_City')::date;

comment on view public.v_time_allocated is
  'Tiempo por tramo y día (America/Mexico_City): clock_seconds real y allocated_seconds repartido entre tareas simultáneas.';

-- ----------------------------------------------------------------------------
-- v_tasks_board: tasks + is_active + active_since + totales + days_to_due.
-- closed_clock_seconds (tramos cerrados) permite al cliente animar el cronómetro sin drift:
-- mostrado = closed_clock_seconds + (ahora - active_since).
-- ----------------------------------------------------------------------------
create or replace view public.v_tasks_board
with (security_invoker = true)
as
select t.id, t.user_id, t.area_id, t.project_id, t.requester_id, t.work_type_id,
       t.title, t.notes, t.due_date, t.priority, t.status, t.started_at, t.completed_at,
       t.created_at, t.updated_at,
       (o.started_at is not null)                                  as is_active,
       o.started_at                                                as active_since,
       coalesce(c.closed_seconds, 0)::integer                      as closed_clock_seconds,
       (coalesce(c.closed_seconds, 0)
        + coalesce(extract(epoch from (now() - o.started_at)), 0))::integer as total_clock_seconds,
       coalesce(a.allocated, 0)::integer                           as total_allocated_seconds,
       case when t.due_date is null then null
            else t.due_date - (now() at time zone 'America/Mexico_City')::date end as days_to_due
  from public.tasks t
  left join lateral (
         select te.started_at from public.time_entries te
          where te.task_id = t.id and te.ended_at is null
          limit 1) o on true
  left join lateral (
         select sum(te.duration_seconds) as closed_seconds from public.time_entries te
          where te.task_id = t.id and te.ended_at is not null) c on true
  left join (
         select task_id, sum(allocated_seconds) as allocated
           from public.v_time_allocated
          group by task_id) a on a.task_id = t.id;

comment on view public.v_tasks_board is
  'Tablero: tareas con is_active, active_since, total_clock_seconds, total_allocated_seconds y days_to_due (America/Mexico_City).';

revoke all on public.v_time_allocated, public.v_tasks_board from public, anon;
grant select on public.v_time_allocated, public.v_tasks_board to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Realtime: el cliente escucha cambios en tasks y time_entries.
-- Supabase Realtime (Postgres Changes) filtra por RLS los INSERT/UPDATE, pero NO los DELETE
-- (no hay fila contra la que evaluar la policy): un DELETE llegaría a todos los suscriptores
-- con la PK de la fila ajena. Por eso la publicación solo emite insert y update, y las tablas
-- se quedan con replica identity default (el test 0004 lo fija). Un borrado hecho desde otro
-- dispositivo se refleja en el siguiente refetch, no en vivo.
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime set (publish = 'insert, update');
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks') then
      alter publication supabase_realtime add table public.tasks;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'time_entries') then
      alter publication supabase_realtime add table public.time_entries;
    end if;
  end if;
end $$;
