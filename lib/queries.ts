/**
 * Acceso a datos. Solo PostgREST parametrizado (.from().select()/.insert()) y RPC con
 * argumentos; toda entrada se valida con Zod antes de tocar la base. user_id nunca se envía:
 * lo pone el trigger desde la sesión.
 */
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { isValidYmd } from '@/lib/time';
import type { Area, BoardTask, Project, Requester, WorkType } from '@/lib/types';

const uuid = z.string().uuid();
const name = z.string().trim().min(1, 'Escribe un nombre.').max(80, 'Máximo 80 caracteres.');
export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido.');
export const ymdSchema = z.string().refine(isValidYmd, 'Fecha inválida (AAAA-MM-DD).');

export const newTaskSchema = z.object({
  title: z.string().trim().min(1, 'Escribe un título.').max(200, 'Máximo 200 caracteres.'),
  area_id: uuid,
  requester_id: uuid.nullable(),
  work_type_id: uuid.nullable(),
  project_id: uuid.nullable(),
  due_date: ymdSchema.nullable(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  notes: z.string().trim().max(2000).nullable(),
});
export type NewTask = z.infer<typeof newTaskSchema>;

export const newAreaSchema = z.object({
  name: name.pipe(z.string().max(60, 'Máximo 60 caracteres.')),
  color: colorSchema,
  track_by_type: z.boolean(),
});
export type NewArea = z.infer<typeof newAreaSchema>;

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export interface Catalogs {
  areas: Area[];
  requesters: Requester[];
  workTypes: WorkType[];
  projects: Project[];
}

export async function fetchBoard(): Promise<BoardTask[]> {
  return unwrap(await supabase.from('v_tasks_board').select('*').neq('status', 'cancelled'));
}

export async function fetchCatalogs(): Promise<Catalogs> {
  const [areas, requesters, workTypes, projects] = await Promise.all([
    supabase.from('areas').select('id,name,color,track_by_type,sort_order').order('sort_order').order('name'),
    supabase.from('requesters').select('id,area_id,name').order('name'),
    supabase.from('work_types').select('id,area_id,name').order('name'),
    supabase.from('projects').select('id,area_id,name,archived').eq('archived', false).order('name'),
  ]);
  return {
    areas: unwrap(areas),
    requesters: unwrap(requesters),
    workTypes: unwrap(workTypes),
    projects: unwrap(projects),
  };
}

// ── RPC (el cliente nunca hace update directo de status ni de tramos abiertos) ──────────
async function rpcTask(fn: 'start_task' | 'activate_task' | 'complete_task' | 'reopen_task', taskId: string) {
  uuid.parse(taskId);
  unwrap(await supabase.rpc(fn, { p_task_id: taskId }));
}
export const startTask = (id: string) => rpcTask('start_task', id);
export const activateTask = (id: string) => rpcTask('activate_task', id);
export const completeTask = (id: string) => rpcTask('complete_task', id);
export const reopenTask = (id: string) => rpcTask('reopen_task', id);
export async function pauseTask(taskId: string) {
  uuid.parse(taskId);
  unwrap(await supabase.rpc('pause_task', { p_task_id: taskId }));
}
export async function pauseAll() {
  unwrap(await supabase.rpc('pause_all'));
}

// ── Altas ────────────────────────────────────────────────────────────────────────────────
export interface CreatedTask {
  id: string;
  /** Mensaje si la tarea se creó pero no se pudo iniciar (queda en "Por iniciar"). */
  startError?: string;
}
/**
 * Inserta la tarea y, si se pide, la activa. Si el insert funciona y el activate falla, NO lanza:
 * la tarea ya existe y un reintento del formulario la duplicaría (hallazgo de claude-review).
 */
export async function createTask(input: NewTask, startNow: boolean): Promise<CreatedTask> {
  const row = newTaskSchema.parse(input);
  const created = unwrap(await supabase.from('tasks').insert(row).select('id').single()) as { id: string };
  if (!startNow) return { id: created.id };
  try {
    await activateTask(created.id);
    return { id: created.id };
  } catch (e) {
    return { id: created.id, startError: `La tarea se guardó pero no se pudo iniciar: ${errorMessage(e)}` };
  }
}

export async function createArea(input: NewArea): Promise<Area> {
  const row = newAreaSchema.parse(input);
  return unwrap(await supabase.from('areas').insert(row).select('id,name,color,track_by_type,sort_order').single());
}

export async function createRequester(areaId: string, requesterName: string): Promise<Requester> {
  const row = { area_id: uuid.parse(areaId), name: name.parse(requesterName) };
  return unwrap(await supabase.from('requesters').insert(row).select('id,area_id,name').single());
}

export async function createWorkType(areaId: string, typeName: string): Promise<WorkType> {
  const row = { area_id: uuid.parse(areaId), name: name.parse(typeName) };
  return unwrap(await supabase.from('work_types').insert(row).select('id,area_id,name').single());
}

/** Primer uso: tres áreas genéricas editables. */
export const DEFAULT_AREAS: NewArea[] = [
  { name: 'Trabajo', color: '#2563eb', track_by_type: true },
  { name: 'Personal', color: '#16a34a', track_by_type: false },
  { name: 'Estudios', color: '#9333ea', track_by_type: false },
];
/** Idempotente: si ya hay áreas (doble toque, otra pestaña) no inserta nada. */
export async function createDefaultAreas(): Promise<void> {
  const existing = unwrap(await supabase.from('areas').select('id').limit(1)) as { id: string }[];
  if (existing.length > 0) return;
  const rows = DEFAULT_AREAS.map((a, i) => ({ ...newAreaSchema.parse(a), sort_order: i }));
  unwrap(await supabase.from('areas').insert(rows));
}

/** Mensaje legible para la persona a partir de un error de Zod/PostgREST. */
export function errorMessage(e: unknown): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? 'Datos inválidos.';
  if (e instanceof Error) {
    if (/network|fetch/i.test(e.message)) return 'Sin conexión. Inténtalo de nuevo.';
    if (/cannot be activated|cannot be started|cannot be reopened/.test(e.message)) return 'Esa tarea ya está cerrada.';
    if (/not found/.test(e.message)) return 'La tarea ya no existe.';
    return e.message;
  }
  return 'Algo salió mal.';
}
