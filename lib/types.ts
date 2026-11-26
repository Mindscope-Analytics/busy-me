/** Tipos de dominio (espejo de supabase/migrations). Fechas como ISO string, tal como las entrega PostgREST. */
export type TaskStatus = 'backlog' | 'started' | 'done' | 'cancelled';
export type Priority = 1 | 2 | 3;

export interface Area {
  id: string;
  name: string;
  color: string;
  track_by_type: boolean;
  sort_order: number;
}
export interface Requester {
  id: string;
  area_id: string;
  name: string;
}
export interface WorkType {
  id: string;
  area_id: string;
  name: string;
}
export interface Project {
  id: string;
  area_id: string;
  name: string;
  archived: boolean;
}

/** Fila de public.v_tasks_board. */
export interface BoardTask {
  id: string;
  area_id: string;
  project_id: string | null;
  requester_id: string | null;
  work_type_id: string | null;
  title: string;
  notes: string | null;
  /** YYYY-MM-DD o null. */
  due_date: string | null;
  priority: Priority;
  status: TaskStatus;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  active_since: string | null;
  closed_clock_seconds: number;
  total_clock_seconds: number;
  total_allocated_seconds: number;
  days_to_due: number | null;
}

/** Fila de public.time_entries. */
export interface TimeEntry {
  id: string;
  task_id: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  note: string | null;
}

/** Fila de public.v_time_allocated. */
export interface TimeAllocated {
  time_entry_id: string;
  task_id: string;
  day: string;
  clock_seconds: number;
  allocated_seconds: number;
}
