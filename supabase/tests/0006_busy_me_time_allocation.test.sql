-- Busy Me: v_time_allocated reparte el tiempo en paralelo y corta por día de America/Mexico_City.
begin;
select plan(10);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'user_a@example.com', now(), now());
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
set local role authenticated;

insert into public.areas (id, name) values ('a0000000-0000-0000-0000-000000000001', 'Área A');
insert into public.tasks (id, area_id, title, due_date) values
  ('a0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'Tarea 1', (now() at time zone 'America/Mexico_City')::date + 2),
  ('a0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'Tarea 2', (now() at time zone 'America/Mexico_City')::date - 1),
  ('a0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000001', 'Tarea 3', null);

-- Caso 1: 1 h con 2 tareas en paralelo (10:00–11:00 hora de la Ciudad de México, enero = UTC-6)
insert into public.time_entries (id, task_id, started_at, ended_at) values
  ('a0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000011', '2026-01-15 10:00-06', '2026-01-15 11:00-06'),
  ('a0000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000012', '2026-01-15 10:00-06', '2026-01-15 11:00-06');

select is((select clock_seconds from public.v_time_allocated where time_entry_id = 'a0000000-0000-0000-0000-000000000021'), 3600, 'paralelo: reloj de la tarea 1 = 3600');
select is((select allocated_seconds from public.v_time_allocated where time_entry_id = 'a0000000-0000-0000-0000-000000000021'), 1800, 'paralelo: asignado de la tarea 1 = 1800');
select is((select clock_seconds from public.v_time_allocated where time_entry_id = 'a0000000-0000-0000-0000-000000000022'), 3600, 'paralelo: reloj de la tarea 2 = 3600');
select is((select allocated_seconds from public.v_time_allocated where time_entry_id = 'a0000000-0000-0000-0000-000000000022'), 1800, 'paralelo: asignado de la tarea 2 = 1800');
select is((select day from public.v_time_allocated where time_entry_id = 'a0000000-0000-0000-0000-000000000021'), '2026-01-15'::date, 'el día es el de America/Mexico_City');

-- Caso 2: solapamiento parcial, otro día: T1 14:00–16:00, T3 15:00–16:00 → T1 = 3600 + 1800, T3 = 1800
insert into public.time_entries (id, task_id, started_at, ended_at) values
  ('a0000000-0000-0000-0000-000000000023', 'a0000000-0000-0000-0000-000000000011', '2026-01-16 14:00-06', '2026-01-16 16:00-06'),
  ('a0000000-0000-0000-0000-000000000024', 'a0000000-0000-0000-0000-000000000013', '2026-01-16 15:00-06', '2026-01-16 16:00-06');
select is((select allocated_seconds from public.v_time_allocated where time_entry_id = 'a0000000-0000-0000-0000-000000000023'), 5400, 'solape parcial: la tarea larga recibe 5400');
select is((select allocated_seconds from public.v_time_allocated where time_entry_id = 'a0000000-0000-0000-0000-000000000024'), 1800, 'solape parcial: la tarea corta recibe 1800');

-- Caso 3: un tramo que cruza la medianoche local se parte en dos días
insert into public.time_entries (id, task_id, started_at, ended_at) values
  ('a0000000-0000-0000-0000-000000000025', 'a0000000-0000-0000-0000-000000000013', '2026-01-20 23:00-06', '2026-01-21 01:00-06');
select results_eq(
  $$ select day, clock_seconds from public.v_time_allocated where time_entry_id = 'a0000000-0000-0000-0000-000000000025' order by day $$,
  $$ values ('2026-01-20'::date, 3600), ('2026-01-21'::date, 3600) $$,
  'cruce de medianoche: 3600 s el día 20 y 3600 s el día 21');

-- Tablero: totales y days_to_due
select is((select total_clock_seconds || '/' || total_allocated_seconds from public.v_tasks_board where id = 'a0000000-0000-0000-0000-000000000011'),
  '10800/7200', 'tablero: tarea 1 = 3 h reloj, 2 h asignadas');
select results_eq(
  $$ select days_to_due from public.v_tasks_board order by title $$,
  $$ values (2), (-1), (null::integer) $$,
  'tablero: days_to_due = +2, -1 y null');

reset role;
select * from finish();
rollback;
