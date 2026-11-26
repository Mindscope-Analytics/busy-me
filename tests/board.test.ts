import {
  displayedClockSeconds,
  forgottenCutoff,
  forgottenTimers,
  groupTasks,
  isLateEveningWithActive,
  needsParallelConfirm,
  recentlyDone,
  suggestNext,
} from '../lib/board';
import type { BoardTask } from '../lib/types';

const NOW = new Date('2026-01-16T05:30:00Z'); // 15 ene 2026, 23:30 CDMX

function task(partial: Partial<BoardTask> & { id: string }): BoardTask {
  return {
    area_id: 'area-a',
    project_id: null,
    requester_id: null,
    work_type_id: null,
    title: `Tarea ${partial.id}`,
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
    ...partial,
  };
}

describe('groupTasks', () => {
  const tasks: BoardTask[] = [
    task({ id: 'act-2', is_active: true, active_since: '2026-01-16T05:00:00Z' }),
    task({ id: 'act-1', is_active: true, active_since: '2026-01-16T04:00:00Z' }),
    task({ id: 'p-sin-fecha', priority: 1 }),
    task({ id: 'p-vencida', due_date: '2026-01-14' }),
    task({ id: 'p-pronto-baja', due_date: '2026-01-17', priority: 3 }),
    task({ id: 'p-pronto-alta', due_date: '2026-01-17', priority: 1 }),
    task({ id: 'p-lejos', due_date: '2026-02-20' }),
    task({ id: 'p-hoy', due_date: '2026-01-15' }),
    task({ id: 'b-1', status: 'backlog', due_date: '2026-01-20' }),
    task({ id: 'b-2', status: 'backlog', area_id: 'area-b' }),
    task({ id: 'd-viejo', status: 'done', completed_at: '2025-12-01T10:00:00Z' }),
    task({ id: 'd-nuevo', status: 'done', completed_at: '2026-01-15T10:00:00Z' }),
    task({ id: 'cancel', status: 'cancelled' }),
  ];
  const g = groupTasks(tasks, NOW);

  it('activas = started con cronómetro, por active_since ascendente', () => {
    expect(g.active.map((t) => t.id)).toEqual(['act-1', 'act-2']);
  });
  it('pendientes: vencidas, luego ≤3 días (due asc, priority asc), luego resto; sin fecha al final', () => {
    expect(g.pending.map((t) => t.id)).toEqual([
      'p-vencida',
      'p-hoy',
      'p-pronto-alta',
      'p-pronto-baja',
      'p-lejos',
      'p-sin-fecha',
    ]);
  });
  it('por iniciar = backlog; completadas más reciente primero; cancelled no aparece', () => {
    expect(g.backlog.map((t) => t.id)).toEqual(['b-1', 'b-2']);
    expect(g.done.map((t) => t.id)).toEqual(['d-nuevo', 'd-viejo']);
  });
  it('filtra por área', () => {
    const b = groupTasks(tasks, NOW, 'area-b');
    expect(b.backlog.map((t) => t.id)).toEqual(['b-2']);
    expect(b.pending).toHaveLength(0);
  });
  it('sugiere las 3 más urgentes (pendientes antes que por iniciar)', () => {
    expect(suggestNext(g).map((t) => t.id)).toEqual(['p-vencida', 'p-hoy', 'p-pronto-alta']);
    expect(suggestNext({ ...g, pending: [] }).map((t) => t.id)).toEqual(['b-1', 'b-2']);
  });
  it('completadas de los últimos 30 días', () => {
    expect(recentlyDone(g.done, NOW).map((t) => t.id)).toEqual(['d-nuevo']);
  });
});

describe('cronómetro y avisos', () => {
  it('displayedClockSeconds suma lo cerrado y lo que lleva abierto', () => {
    const t = task({ id: 'a', is_active: true, active_since: '2026-01-16T05:00:00Z', closed_clock_seconds: 600 });
    expect(displayedClockSeconds(t, NOW)).toBe(600 + 1800);
    expect(displayedClockSeconds(task({ id: 'b', closed_clock_seconds: 42 }), NOW)).toBe(42);
  });
  it('forgottenTimers: activas desde hace ≥ 4 h', () => {
    const fresh = task({ id: 'f', is_active: true, active_since: '2026-01-16T03:00:00Z' }); // 2.5 h
    const old = task({ id: 'o', is_active: true, active_since: '2026-01-16T01:00:00Z' }); // 4.5 h
    expect(forgottenTimers([fresh, old], NOW).map((t) => t.id)).toEqual(['o']);
    expect(forgottenCutoff(old)?.toISOString()).toBe('2026-01-16T05:00:00.000Z');
  });
  it('banner global después de las 21:00 CDMX solo si hay activas', () => {
    const active = [task({ id: 'a', is_active: true, active_since: '2026-01-16T05:00:00Z' })];
    expect(isLateEveningWithActive(active, NOW)).toBe(true); // 23:30 CDMX
    expect(isLateEveningWithActive(active, new Date('2026-01-16T02:59:00Z'))).toBe(false); // 20:59 CDMX
    expect(isLateEveningWithActive([], NOW)).toBe(false);
  });
  it('confirmación al activar la 4ª simultánea', () => {
    expect(needsParallelConfirm(2)).toBe(false);
    expect(needsParallelConfirm(3)).toBe(true);
  });
});
