import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import * as q from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import type { BoardTask } from '@/lib/types';

/**
 * Estado del tablero: tareas (v_tasks_board) + catálogos, con Realtime sobre tasks y
 * time_entries (INSERT/UPDATE propios; los borrados llegan en el siguiente refetch) y acciones
 * que siempre pasan por las RPC y refrescan al terminar.
 */
interface BoardContextValue {
  tasks: BoardTask[];
  catalogs: q.Catalogs;
  loading: boolean;
  error: string | null;
  /** Aviso no bloqueante (p. ej. "se guardó pero no se pudo iniciar"); null lo limpia. */
  notice: string | null;
  setNotice: (msg: string | null) => void;
  areaFilter: string | null;
  setAreaFilter: (id: string | null) => void;
  refresh: () => Promise<void>;
  act: (fn: () => Promise<unknown>) => Promise<boolean>;
}

const empty: q.Catalogs = { areas: [], requesters: [], workTypes: [], projects: [] };
const BoardContext = createContext<BoardContextValue | undefined>(undefined);

export function BoardProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [catalogs, setCatalogs] = useState<q.Catalogs>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const [t, c] = await Promise.all([q.fetchBoard(), q.fetchCatalogs()]);
      setTasks(t);
      setCatalogs(c);
      setError(null);
    } catch (e) {
      setError(q.errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Varios eventos seguidos (activar = update de task + insert de tramo) → un solo refetch.
  const scheduleRefresh = useCallback(() => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => void refresh(), 150);
  }, [refresh]);

  useEffect(() => {
    if (!user) {
      setTasks([]);
      setCatalogs(empty);
      return;
    }
    void refresh();
    // Solo INSERT y UPDATE: la publicación no emite DELETE (no se filtra por RLS; ADR-0006).
    const own = (table: 'tasks' | 'time_entries', event: 'INSERT' | 'UPDATE') =>
      ({ event, schema: 'public', table, filter: `user_id=eq.${user.id}` }) as const;
    const channel = supabase
      .channel(`board-${user.id}`)
      .on('postgres_changes', own('tasks', 'INSERT'), scheduleRefresh)
      .on('postgres_changes', own('tasks', 'UPDATE'), scheduleRefresh)
      .on('postgres_changes', own('time_entries', 'INSERT'), scheduleRefresh)
      .on('postgres_changes', own('time_entries', 'UPDATE'), scheduleRefresh)
      .subscribe();
    return () => {
      if (pending.current) clearTimeout(pending.current);
      void supabase.removeChannel(channel);
    };
  }, [user, refresh, scheduleRefresh]);

  const act = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        await refresh();
        return true;
      } catch (e) {
        setError(q.errorMessage(e));
        await refresh();
        return false;
      }
    },
    [refresh]
  );

  const value = useMemo<BoardContextValue>(
    () => ({ tasks, catalogs, loading, error, notice, setNotice, areaFilter, setAreaFilter, refresh, act }),
    [tasks, catalogs, loading, error, notice, areaFilter, refresh, act]
  );
  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

export function useBoard(): BoardContextValue {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error('useBoard debe usarse dentro de <BoardProvider>.');
  return ctx;
}
