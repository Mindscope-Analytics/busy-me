-- Busy Me: RPC de estado y cronómetros + guardas de escritura directa.
begin;
select plan(28);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'user_a@example.com', now(), now());
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
set local role authenticated;

insert into public.areas (id, name) values ('a0000000-0000-0000-0000-000000000001', 'Área A');
insert into public.tasks (id, area_id, title) values
  ('a0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'Tarea 1'),
  ('a0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'Tarea 2'),
  ('a0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000001', 'Tarea 3'),
  ('a0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000001', 'Tarea 4');

-- Guardas: el cliente no cambia estado ni abre tramos directamente -----------------------
select throws_ok(
  $$ update public.tasks set status = 'started' where id = 'a0000000-0000-0000-0000-000000000011' $$,
  'P0001', null, 'update directo de status se rechaza');
select throws_ok(
  $$ update public.tasks set started_at = now() where id = 'a0000000-0000-0000-0000-000000000011' $$,
  'P0001', null, 'update directo de started_at se rechaza');
select throws_ok(
  $$ insert into public.tasks (area_id, title, status) values ('a0000000-0000-0000-0000-000000000001', 'x', 'started') $$,
  'P0001', null, 'insert con status distinto de backlog se rechaza');
select throws_ok(
  $$ insert into public.time_entries (task_id, started_at) values ('a0000000-0000-0000-0000-000000000011', now()) $$,
  'P0001', null, 'insert directo de un tramo abierto se rechaza');
select lives_ok(
  $$ update public.tasks set title = 'Tarea 1 editada', priority = 1 where id = 'a0000000-0000-0000-0000-000000000011' $$,
  'update directo de campos editables sí pasa');
select lives_ok(
  $$ insert into public.time_entries (id, task_id, started_at, ended_at)
     values ('a0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000011', now() - interval '3 hours', now() - interval '2 hours') $$,
  'insert manual de un tramo cerrado sí pasa');
select lives_ok(
  $$ update public.time_entries set ended_at = now() - interval '2 hours 30 minutes' where id = 'a0000000-0000-0000-0000-000000000021' $$,
  'editar un tramo cerrado sí pasa');
select throws_ok(
  $$ update public.time_entries set ended_at = null where id = 'a0000000-0000-0000-0000-000000000021' $$,
  'P0001', null, 'reabrir un tramo cerrado por update directo se rechaza');

-- activate desde backlog: started + started_at + un tramo abierto ---------------------------
select public.activate_task('a0000000-0000-0000-0000-000000000011');
select is((select status::text from public.tasks where id = 'a0000000-0000-0000-0000-000000000011'), 'started', 'activate desde backlog → started');
select ok((select started_at is not null from public.tasks where id = 'a0000000-0000-0000-0000-000000000011'), 'activate desde backlog fija started_at');
select is((select count(*)::int from public.time_entries where task_id = 'a0000000-0000-0000-0000-000000000011' and ended_at is null), 1, 'activate abre un tramo');

-- activar dos veces no duplica -------------------------------------------------------------
select public.activate_task('a0000000-0000-0000-0000-000000000011');
select is((select count(*)::int from public.time_entries where task_id = 'a0000000-0000-0000-0000-000000000011' and ended_at is null), 1, 'activar dos veces deja un solo tramo abierto');

-- activar A y B deja ambos abiertos ------------------------------------------------------------
select public.activate_task('a0000000-0000-0000-0000-000000000012');
select is((select count(*)::int from public.time_entries where ended_at is null), 2, 'activar dos tareas deja dos tramos abiertos (paralelo)');
select is((select count(*)::int from public.v_tasks_board where is_active), 2, 'el tablero marca las dos como activas');

-- pause_task cierra solo la suya --------------------------------------------------------------
select is(public.pause_task('a0000000-0000-0000-0000-000000000011'), 1, 'pause_task cierra un tramo');
select is((select count(*)::int from public.time_entries where ended_at is null), 1, 'la otra tarea sigue activa');
select is(public.pause_task('a0000000-0000-0000-0000-000000000011'), 0, 'pause_task sin tramo abierto es no-op');
select is((select status::text from public.tasks where id = 'a0000000-0000-0000-0000-000000000011'), 'started', 'pausar no cambia el status (sigue started = pendiente)');

-- pause_all cierra todo -------------------------------------------------------------------------
select public.activate_task('a0000000-0000-0000-0000-000000000011');
select is(public.pause_all(), 2, 'pause_all cierra los dos tramos abiertos');
select is((select count(*)::int from public.time_entries where ended_at is null), 0, 'no queda ningún tramo abierto');

-- complete cierra solo su timer -------------------------------------------------------------------
select public.activate_task('a0000000-0000-0000-0000-000000000011');
select public.activate_task('a0000000-0000-0000-0000-000000000012');
select public.complete_task('a0000000-0000-0000-0000-000000000011');
select is((select status::text from public.tasks where id = 'a0000000-0000-0000-0000-000000000011'), 'done', 'complete → done');
select ok((select completed_at is not null from public.tasks where id = 'a0000000-0000-0000-0000-000000000011'), 'complete fija completed_at');
select is((select count(*)::int from public.time_entries where task_id = 'a0000000-0000-0000-0000-000000000011' and ended_at is null), 0, 'complete cerró su tramo');
select is((select count(*)::int from public.time_entries where task_id = 'a0000000-0000-0000-0000-000000000012' and ended_at is null), 1, 'complete no tocó el tramo de la otra tarea');

-- no se activa una tarea done; reopen la devuelve a started --------------------------------------
select throws_ok(
  $$ select public.activate_task('a0000000-0000-0000-0000-000000000011') $$,
  'P0001', null, 'no se puede activar una tarea done');
select public.reopen_task('a0000000-0000-0000-0000-000000000011');
select is((select status::text || ':' || coalesce(completed_at::text, 'null') from public.tasks where id = 'a0000000-0000-0000-0000-000000000011'),
  'started:null', 'reopen → started y completed_at null');

-- start_task: backlog → started sin abrir tramo --------------------------------------------------
select public.start_task('a0000000-0000-0000-0000-000000000014');
select is((select status::text from public.tasks where id = 'a0000000-0000-0000-0000-000000000014'), 'started', 'start_task → started');
select is((select count(*)::int from public.time_entries where task_id = 'a0000000-0000-0000-0000-000000000014'), 0, 'start_task no abre tramo');

reset role;
select * from finish();
rollback;
