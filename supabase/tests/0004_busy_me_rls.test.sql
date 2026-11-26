-- Busy Me: RLS con dos usuarios en las 6 tablas; B no lee, no escribe ni cuelga filas de A.
begin;
select plan(26);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'user_a@example.com', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'user_b@example.com', now(), now());

-- A crea una fila en cada tabla (como authenticated: el trigger pone user_id) ----------
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);
set local role authenticated;
insert into public.areas (id, name) values ('a0000000-0000-0000-0000-000000000001', 'Área A');
insert into public.requesters (id, area_id, name) values ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Solicitante 1');
insert into public.work_types (id, area_id, name) values ('a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Tipo 1');
insert into public.projects (id, area_id, name) values ('a0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Proyecto 1');
insert into public.tasks (id, area_id, requester_id, work_type_id, project_id, title)
  values ('a0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002',
          'a0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'Tarea de ejemplo');
insert into public.time_entries (id, task_id, started_at, ended_at)
  values ('a0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000005', now() - interval '2 hours', now() - interval '1 hour');

select is((select user_id from public.areas where id = 'a0000000-0000-0000-0000-000000000001'),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'el trigger puso user_id = auth.uid() en areas');
select is((select count(*)::int from public.v_tasks_board), 1, 'A ve su tarea en el tablero');
reset role;

-- A intenta falsificar user_id: el trigger lo sobrescribe -------------------------------
set local role authenticated;
insert into public.areas (id, name, user_id) values ('a0000000-0000-0000-0000-000000000007', 'Área falsa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is((select user_id from public.areas where id = 'a0000000-0000-0000-0000-000000000007'),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'user_id enviado por el cliente se ignora: siempre auth.uid()');
reset role;

-- anon: nada -----------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$ select count(*) from public.tasks $$, '42501', null, 'anon no tiene grant sobre tasks');
select throws_ok($$ select count(*) from public.v_tasks_board $$, '42501', null, 'anon no tiene grant sobre v_tasks_board');
select throws_ok($$ select public.pause_all() $$, '42501', null, 'anon no puede ejecutar las RPC');
select throws_ok($$ select public.via_rpc() $$, '42501', null, 'anon no puede ejecutar via_rpc()');
reset role;

-- B: no ve nada de A -----------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.areas), 0, 'B no ve áreas de A');
select is((select count(*)::int from public.requesters), 0, 'B no ve solicitantes de A');
select is((select count(*)::int from public.work_types), 0, 'B no ve tipos de A');
select is((select count(*)::int from public.projects), 0, 'B no ve proyectos de A');
select is((select count(*)::int from public.tasks), 0, 'B no ve tareas de A');
select is((select count(*)::int from public.time_entries), 0, 'B no ve tramos de A');
select is((select count(*)::int from public.v_tasks_board), 0, 'B no ve el tablero de A');
select is((select count(*)::int from public.v_time_allocated), 0, 'B no ve el reparto de tiempo de A');

-- B: no escribe sobre A ----------------------------------------------------------------------
update public.tasks set title = 'hackeado' where id = 'a0000000-0000-0000-0000-000000000005';
delete from public.time_entries where id = 'a0000000-0000-0000-0000-000000000006';
reset role;
select is((select title from public.tasks where id = 'a0000000-0000-0000-0000-000000000005'), 'Tarea de ejemplo', 'el update de B sobre la tarea de A no afectó filas');
select is((select count(*)::int from public.time_entries where id = 'a0000000-0000-0000-0000-000000000006'), 1, 'el delete de B sobre el tramo de A no afectó filas');

-- B: no cuelga filas de recursos de A aunque conozca el uuid ------------------------------
set local role authenticated;
select throws_ok(
  $$ insert into public.tasks (area_id, title) values ('a0000000-0000-0000-0000-000000000001', 'colada') $$,
  '42501', null, 'B no puede crear una tarea en el área de A');
select throws_ok(
  $$ insert into public.requesters (area_id, name) values ('a0000000-0000-0000-0000-000000000001', 'colado') $$,
  '42501', null, 'B no puede crear un solicitante en el área de A');
select throws_ok(
  $$ insert into public.time_entries (task_id, started_at, ended_at) values ('a0000000-0000-0000-0000-000000000005', now() - interval '1 hour', now()) $$,
  '42501', null, 'B no puede crear un tramo en la tarea de A');
select throws_ok(
  $$ select public.activate_task('a0000000-0000-0000-0000-000000000005') $$,
  'P0002', null, 'B no puede activar la tarea de A (not found bajo RLS)');
insert into public.areas (id, name) values ('b0000000-0000-0000-0000-000000000001', 'Área B');
select throws_ok(
  $$ insert into public.tasks (area_id, requester_id, title) values ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'x') $$,
  '42501', null, 'B no puede usar un solicitante de A en su propia tarea');
select lives_ok(
  $$ insert into public.tasks (area_id, title) values ('b0000000-0000-0000-0000-000000000001', 'Tarea B') $$,
  'B sí crea tareas en su propia área');
reset role;

-- Realtime: sin DELETE en la publicación (no se filtra por RLS) y replica identity default ----
select is(
  (select pubdelete from pg_publication where pubname = 'supabase_realtime'),
  false, 'la publicación supabase_realtime no emite DELETE');
select is(
  (select pubinsert and pubupdate from pg_publication where pubname = 'supabase_realtime'),
  true, 'la publicación supabase_realtime emite INSERT y UPDATE');
select is(
  (select string_agg(c.relname || ':' || c.relreplident::text, ',' order by c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('tasks', 'time_entries')),
  'tasks:d,time_entries:d', 'tasks y time_entries conservan replica identity default (solo la PK viaja en los eventos)');

select * from finish();
rollback;
