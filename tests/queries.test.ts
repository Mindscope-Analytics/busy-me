import type { createSupabaseMock } from './supabase-mock';

// jest.mock se eleva por encima de los imports: el doble se crea dentro de la fábrica y se
// comparte por globalThis para que las pruebas puedan encolar respuestas y leer las llamadas.
jest.mock('@/lib/supabase', () => {
  const { createSupabaseMock: create } = jest.requireActual<typeof import('./supabase-mock')>('./supabase-mock');
  const m = create();
  (globalThis as Record<string, unknown>).__supabaseMock = m;
  return { supabase: m.client };
});

import * as q from '../lib/queries';

const mock = (globalThis as Record<string, unknown>).__supabaseMock as ReturnType<typeof createSupabaseMock>;

const AREA = '11111111-1111-4111-8111-111111111111';
const TASK = '22222222-2222-4222-8222-222222222222';
const baseTask: q.NewTask = {
  title: 'Tarea de ejemplo',
  area_id: AREA,
  requester_id: null,
  work_type_id: null,
  project_id: null,
  due_date: null,
  priority: 2,
  notes: null,
};

beforeEach(() => {
  mock.calls.length = 0;
});

describe('esquemas Zod (se validan antes de tocar la base)', () => {
  it('newTaskSchema recorta el título y rechaza vacío, fecha inválida y prioridad fuera de rango', () => {
    expect(q.newTaskSchema.parse({ ...baseTask, title: '  Tarea  ' }).title).toBe('Tarea');
    expect(q.newTaskSchema.safeParse({ ...baseTask, title: '   ' }).success).toBe(false);
    expect(q.newTaskSchema.safeParse({ ...baseTask, due_date: '2026-02-30' }).success).toBe(false);
    expect(q.newTaskSchema.safeParse({ ...baseTask, due_date: '15/01/2026' }).success).toBe(false);
    expect(q.newTaskSchema.safeParse({ ...baseTask, priority: 4 }).success).toBe(false);
    expect(q.newTaskSchema.safeParse({ ...baseTask, area_id: 'no-es-uuid' }).success).toBe(false);
  });
  it('newTaskSchema descarta campos que no son suyos (status, user_id)', () => {
    const parsed = q.newTaskSchema.parse({ ...baseTask, status: 'started', user_id: 'x' } as unknown as q.NewTask);
    expect(parsed).not.toHaveProperty('status');
    expect(parsed).not.toHaveProperty('user_id');
  });
  it('newAreaSchema exige color #rrggbb y nombre ≤ 60', () => {
    expect(q.newAreaSchema.safeParse({ name: 'Área', color: '#2563eb', track_by_type: true }).success).toBe(true);
    expect(q.newAreaSchema.safeParse({ name: 'Área', color: 'blue', track_by_type: true }).success).toBe(false);
    expect(q.newAreaSchema.safeParse({ name: 'x'.repeat(61), color: '#2563eb', track_by_type: false }).success).toBe(false);
  });
});

describe('createTask', () => {
  it('sin iniciar: un insert, sin RPC', async () => {
    mock.push({ data: { id: TASK } });
    const r = await q.createTask(baseTask, false);
    expect(r).toEqual({ id: TASK });
    expect(mock.calls.map((c) => c.table ?? c.rpc)).toEqual(['tasks']);
  });
  it('con iniciar: insert + activate_task con el id creado', async () => {
    mock.push({ data: { id: TASK } });
    mock.push({ data: null });
    const r = await q.createTask(baseTask, true);
    expect(r).toEqual({ id: TASK });
    expect(mock.calls[1]).toMatchObject({ rpc: 'activate_task', args: { p_task_id: TASK } });
  });
  it('si el activate falla NO lanza: devuelve el id y un aviso (un reintento no duplica)', async () => {
    mock.push({ data: { id: TASK } });
    mock.push({ error: { message: 'task is done and cannot be activated' } });
    const r = await q.createTask(baseTask, true);
    expect(r.id).toBe(TASK);
    expect(r.startError).toMatch(/se guardó pero no se pudo iniciar/);
  });
  it('si el insert falla sí lanza y no llama a la RPC', async () => {
    mock.push({ error: { message: 'new row violates row-level security policy' } });
    await expect(q.createTask(baseTask, true)).rejects.toThrow(/row-level security/);
    expect(mock.calls).toHaveLength(1);
  });
  it('rechaza datos inválidos antes de tocar la base', async () => {
    await expect(q.createTask({ ...baseTask, title: '' }, false)).rejects.toBeTruthy();
    expect(mock.calls).toHaveLength(0);
  });
});

describe('createDefaultAreas', () => {
  it('no inserta si ya hay áreas', async () => {
    mock.push({ data: [{ id: AREA }] });
    await q.createDefaultAreas();
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0].chain.map((c) => c.method)).toEqual(['select', 'limit']);
  });
  it('inserta las tres áreas genéricas con sort_order cuando no hay ninguna', async () => {
    mock.push({ data: [] });
    mock.push({ data: null });
    await q.createDefaultAreas();
    const insert = mock.calls[1].chain.find((c) => c.method === 'insert');
    const rows = insert?.args[0] as { name: string; sort_order: number; track_by_type: boolean }[];
    expect(rows.map((r) => r.name)).toEqual(['Trabajo', 'Personal', 'Estudios']);
    expect(rows.map((r) => r.sort_order)).toEqual([0, 1, 2]);
    expect(rows[0].track_by_type).toBe(true);
  });
});

describe('RPC de estado', () => {
  it('pasan el uuid como p_task_id y rechazan ids inválidos sin llamar', async () => {
    mock.push({ data: null });
    await q.pauseTask(TASK);
    expect(mock.calls[0]).toMatchObject({ rpc: 'pause_task', args: { p_task_id: TASK } });
    await expect(q.activateTask('abc')).rejects.toBeTruthy();
    expect(mock.calls).toHaveLength(1);
  });
  it('propagan el error de la base como Error', async () => {
    mock.push({ error: { message: 'task not found' } });
    await expect(q.completeTask(TASK)).rejects.toThrow('task not found');
  });
});

describe('errorMessage', () => {
  it('traduce los errores conocidos y cae al mensaje crudo', () => {
    expect(q.errorMessage(new Error('task is done and cannot be activated'))).toBe('Esa tarea ya está cerrada.');
    expect(q.errorMessage(new Error('task not found'))).toBe('La tarea ya no existe.');
    expect(q.errorMessage(new Error('TypeError: Failed to fetch'))).toBe('Sin conexión. Inténtalo de nuevo.');
    expect(q.errorMessage(new Error('otra cosa'))).toBe('otra cosa');
    expect(q.errorMessage(undefined)).toBe('Algo salió mal.');
    const zod = q.newTaskSchema.safeParse({ ...baseTask, title: '' });
    if (!zod.success) expect(q.errorMessage(zod.error)).toBe('Escribe un título.');
  });
});
