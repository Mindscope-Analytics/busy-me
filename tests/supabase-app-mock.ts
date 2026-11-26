/**
 * Doble de supabase-js para montar pantallas completas (expo-router/testing-library) sin red:
 * sesión fija, Realtime inerte y consultas que resuelven filas por tabla (vacío por defecto).
 * Complementa a supabase-mock.ts (cola de respuestas para lib/queries).
 */
import type { BoardTask } from '../lib/types';

export const TEST_USER_ID = '00000000-0000-4000-8000-000000000001';
export const TEST_TASK_ID = '22222222-2222-4222-8222-222222222222';
export const TEST_AREA_ID = '11111111-1111-4111-8111-111111111111';

export const testTask: BoardTask = {
  id: TEST_TASK_ID,
  area_id: TEST_AREA_ID,
  project_id: null,
  requester_id: null,
  work_type_id: null,
  title: 'Tarea de ejemplo',
  notes: null,
  due_date: null,
  priority: 2,
  status: 'started',
  started_at: '2026-01-10T12:00:00Z',
  completed_at: null,
  created_at: '2026-01-10T12:00:00Z',
  updated_at: '2026-01-10T12:00:00Z',
  is_active: false,
  active_since: null,
  closed_clock_seconds: 0,
  total_clock_seconds: 0,
  total_allocated_seconds: 0,
  days_to_due: null,
};

const rows: Record<string, unknown[]> = {
  v_tasks_board: [testTask],
  areas: [{ id: TEST_AREA_ID, name: 'Área A', color: '#2563eb', track_by_type: false, sort_order: 0 }],
};

export function createAppSupabaseMock(opts: { signedIn: boolean }) {
  const session = opts.signedIn
    ? { user: { id: TEST_USER_ID, email: 'usuario@example.com' }, access_token: 't', refresh_token: 'r' }
    : null;
  const subscriptions: string[] = [];

  function builder(table: string) {
    const b: Record<string, unknown> = {
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve, reject),
    };
    for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'is', 'order', 'limit', 'single']) {
      b[m] = () => b;
    }
    return b;
  }

  const channel = {
    on: () => channel,
    subscribe: () => {
      subscriptions.push('subscribed');
      return channel;
    },
  };

  return {
    subscriptions,
    client: {
      auth: {
        getSession: async () => ({ data: { session }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
        signOut: async () => ({ error: null }),
      },
      channel: () => channel,
      removeChannel: async () => 'ok',
      from: (table: string) => builder(table),
      rpc: async () => ({ data: null, error: null }),
    },
  };
}
