import { router } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AreaChips } from '@/components/AreaChips';
import { TaskCard } from '@/components/TaskCard';
import { TimerBanners } from '@/components/TimerBanners';
import { Banner, Button, Empty, SectionHeader, colors } from '@/components/ui';
import { useBoard } from '@/hooks/useBoard';
import { useNow } from '@/hooks/useNow';
import { groupTasks, needsParallelConfirm, suggestNext } from '@/lib/board';
import { confirmAsync } from '@/lib/confirm';
import * as q from '@/lib/queries';
import type { BoardTask } from '@/lib/types';

/** Pantalla "Ahora": Activas → Pendientes → Por iniciar. */
export default function NowScreen() {
  const insets = useSafeAreaInsets();
  const now = useNow();
  const { tasks, catalogs, loading, error, notice, setNotice, areaFilter, setAreaFilter, act } = useBoard();
  const [showBacklog, setShowBacklog] = useState(true);
  const groups = useMemo(() => groupTasks(tasks, now, areaFilter), [tasks, now, areaFilter]);
  // Las activas de TODAS las áreas: el filtro no debe esconder tareas al contar el paralelo.
  const activeTotal = useMemo(() => tasks.filter((t) => t.status === 'started' && t.is_active).length, [tasks]);
  const byId = useMemo(
    () => ({
      area: new Map(catalogs.areas.map((a) => [a.id, a])),
      requester: new Map(catalogs.requesters.map((r) => [r.id, r])),
      workType: new Map(catalogs.workTypes.map((w) => [w.id, w])),
    }),
    [catalogs]
  );

  async function activate(task: BoardTask) {
    if (needsParallelConfirm(activeTotal)) {
      const ok = await confirmAsync(
        'Varias tareas a la vez',
        `Ya tienes ${activeTotal} activas. ¿Activar también "${task.title}"? El tiempo se repartirá entre todas.`,
        'Activar'
      );
      if (!ok) return;
    }
    await act(() => q.activateTask(task.id));
  }
  const pause = (t: BoardTask) => act(() => q.pauseTask(t.id));
  const complete = (t: BoardTask) => act(() => q.completeTask(t.id));
  const start = (t: BoardTask) => act(() => q.startTask(t.id));

  const card = (t: BoardTask, actions: React.ComponentProps<typeof TaskCard>['actions']) => (
    <TaskCard
      key={t.id}
      task={t}
      now={now}
      area={byId.area.get(t.area_id)}
      requester={t.requester_id ? byId.requester.get(t.requester_id) : undefined}
      workType={t.work_type_id ? byId.workType.get(t.work_type_id) : undefined}
      actions={actions}
      onOpen={() => router.push({ pathname: '/task/[id]', params: { id: t.id } })}
    />
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]} testID="home">
      <View style={styles.header}>
        <Text style={styles.h1}>Ahora</Text>
        <Button label="+ Tarea" variant="primary" onPress={() => router.push('/task/new')} testID="new-task" />
      </View>
      <AreaChips areas={catalogs.areas} selected={areaFilter} onSelect={setAreaFilter} />
      <ScrollView contentContainerStyle={styles.content}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? (
          <Banner tone="warn" text={notice} testID="notice" actions={<Button label="Entendido" variant="ghost" onPress={() => setNotice(null)} />} />
        ) : null}
        {!loading && catalogs.areas.length === 0 ? <FirstUse /> : null}
        <TimerBanners active={groups.active} now={now} act={act} />

        <SectionHeader
          title="Activas"
          count={groups.active.length}
          right={groups.active.length > 1 ? <Button label="Pausar todas" onPress={() => void act(() => q.pauseAll())} testID="pause-all" /> : null}
        />
        <View testID="section-active">
        {groups.active.length === 0 ? (
          <View testID="nothing-active">
            <Empty text={loading ? 'Cargando…' : 'Nada activo'} />
            {suggestNext(groups).map((t) => card(t, [{ label: 'Activar', variant: 'primary', onPress: () => void activate(t), testID: 'activate' }]))}
          </View>
        ) : (
          groups.active.map((t) =>
            card(t, [
              { label: 'Pausar', onPress: () => void pause(t), testID: 'pause' },
              { label: 'Finalizar', variant: 'primary', onPress: () => void complete(t), testID: 'complete' },
            ])
          )
        )}
        </View>

        <SectionHeader title="Pendientes" count={groups.pending.length} />
        <View testID="section-pending">
        {groups.pending.length === 0 ? <Empty text="Sin pendientes" /> : null}
        {groups.pending.map((t) =>
          card(t, [
            { label: 'Activar', variant: 'primary', onPress: () => void activate(t), testID: 'activate' },
            { label: 'Finalizar', onPress: () => void complete(t), testID: 'complete' },
          ])
        )}
        </View>

        <SectionHeader
          title="Por iniciar"
          count={groups.backlog.length}
          right={<Button label={showBacklog ? 'Ocultar' : 'Mostrar'} variant="ghost" onPress={() => setShowBacklog((v) => !v)} testID="toggle-backlog" />}
        />
        <View testID="section-backlog">
        {showBacklog
          ? groups.backlog.map((t) =>
              card(t, [
                { label: 'Iniciar', onPress: () => void start(t), testID: 'start' },
                { label: 'Activar', variant: 'primary', onPress: () => void activate(t), testID: 'activate' },
              ])
            )
          : null}
        {showBacklog && groups.backlog.length === 0 ? <Empty text="Nada por iniciar" /> : null}
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

/** Primer uso: sin áreas no se pueden crear tareas. Ofrece tres genéricas editables. */
function FirstUse() {
  const { act } = useBoard();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  async function create() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    await act(() => q.createDefaultAreas());
    inFlight.current = false;
    setBusy(false);
  }
  return (
    <View style={styles.firstUse} testID="first-use">
      <Text style={styles.firstUseTitle}>Empecemos</Text>
      <Text style={styles.muted}>Cada tarea pertenece a un área. Puedes crear tres por defecto y renombrarlas después en Ajustes.</Text>
      <Button label={busy ? 'Creando…' : 'Crear Trabajo, Personal y Estudios'} variant="primary" disabled={busy} onPress={() => void create()} testID="create-default-areas" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  h1: { fontSize: 28, fontWeight: '800', color: colors.text },
  content: { paddingBottom: 24 },
  error: { color: colors.overdue, marginVertical: 8 },
  muted: { color: colors.muted },
  firstUse: { backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16, gap: 10, marginTop: 12 },
  firstUseTitle: { fontSize: 18, fontWeight: '700' },
});
