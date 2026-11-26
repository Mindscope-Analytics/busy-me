/**
 * Lógica pura del tablero "Ahora": agrupación, orden, sugerencias y avisos de cronómetro
 * olvidado. Sin React ni Supabase: se prueba con jest.
 */
import type { BoardTask } from './types';
import { businessHour, daysToDue, dueTone, secondsSince } from './time';

export interface BoardGroups {
  /** started + cronómetro abierto, por active_since ascendente. */
  active: BoardTask[];
  /** started sin cronómetro: vencidas, luego ≤ 3 días, luego el resto. */
  pending: BoardTask[];
  /** backlog. */
  backlog: BoardTask[];
  /** done, más reciente primero. */
  done: BoardTask[];
}

const toneRank: Record<ReturnType<typeof dueTone>, number> = { overdue: 0, soon: 1, ok: 2, none: 3 };

/** Orden de urgencia: semáforo, due_date asc (sin fecha al final), priority asc, created_at asc. */
export function compareUrgency(now: Date) {
  return (a: BoardTask, b: BoardTask): number => {
    const da = daysToDue(a.due_date, now);
    const db = daysToDue(b.due_date, now);
    const ra = toneRank[dueTone(da)];
    const rb = toneRank[dueTone(db)];
    if (ra !== rb) return ra - rb;
    if (a.due_date !== b.due_date) {
      if (a.due_date === null) return 1;
      if (b.due_date === null) return -1;
      return a.due_date < b.due_date ? -1 : 1;
    }
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
  };
}

export function groupTasks(tasks: BoardTask[], now: Date, areaId: string | null = null): BoardGroups {
  const visible = areaId ? tasks.filter((t) => t.area_id === areaId) : tasks;
  const byUrgency = compareUrgency(now);
  const active = visible
    .filter((t) => t.status === 'started' && t.is_active)
    .sort((a, b) => (a.active_since ?? '').localeCompare(b.active_since ?? ''));
  const pending = visible.filter((t) => t.status === 'started' && !t.is_active).sort(byUrgency);
  const backlog = visible.filter((t) => t.status === 'backlog').sort(byUrgency);
  const done = visible
    .filter((t) => t.status === 'done')
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
  return { active, pending, backlog, done };
}

/** Top N sugeridas cuando no hay nada activo: pendientes primero, luego por iniciar. */
export function suggestNext(groups: BoardGroups, n = 3): BoardTask[] {
  return [...groups.pending, ...groups.backlog].slice(0, n);
}

/** Completadas de los últimos `days` días (por completed_at). */
export function recentlyDone(done: BoardTask[], now: Date, days = 30): BoardTask[] {
  const cutoff = now.getTime() - days * 86_400_000;
  return done.filter((t) => t.completed_at !== null && new Date(t.completed_at).getTime() >= cutoff);
}

/** Segundos de reloj a mostrar: cerrados + lo que lleva el cronómetro abierto (sin drift). */
export function displayedClockSeconds(task: BoardTask, now: Date): number {
  return task.closed_clock_seconds + (task.is_active ? secondsSince(task.active_since, now) : 0);
}

export const FORGOTTEN_AFTER_SECONDS = 4 * 3600;
export const LATE_EVENING_HOUR = 21;
export const PARALLEL_CONFIRM_FROM = 4;

/** Tareas activas desde hace ≥ 4 h: candidatas a "¿Sigues en esto?". */
export function forgottenTimers(active: BoardTask[], now: Date): BoardTask[] {
  return active.filter((t) => secondsSince(t.active_since, now) >= FORGOTTEN_AFTER_SECONDS);
}

/** Instante en que la tarea cumplió 4 h activa (para "Cortar a las HH:mm"). */
export function forgottenCutoff(task: BoardTask): Date | null {
  if (!task.active_since) return null;
  return new Date(new Date(task.active_since).getTime() + FORGOTTEN_AFTER_SECONDS * 1000);
}

/** true si son las 21:00 o más en America/Mexico_City y hay tareas activas. */
export function isLateEveningWithActive(active: BoardTask[], now: Date): boolean {
  return active.length > 0 && businessHour(now) >= LATE_EVENING_HOUR;
}

/** true si activar una más obliga a confirmar (sería la 4ª simultánea o más). */
export function needsParallelConfirm(activeCount: number): boolean {
  return activeCount + 1 >= PARALLEL_CONFIRM_FROM;
}
