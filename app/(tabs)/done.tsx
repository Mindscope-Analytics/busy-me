import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AreaChips } from '@/components/AreaChips';
import { TaskCard } from '@/components/TaskCard';
import { Empty, colors } from '@/components/ui';
import { useBoard } from '@/hooks/useBoard';
import { useNow } from '@/hooks/useNow';
import { groupTasks, recentlyDone } from '@/lib/board';
import * as q from '@/lib/queries';

/** Completadas en los últimos 30 días, con Reabrir. */
export default function DoneScreen() {
  const insets = useSafeAreaInsets();
  const now = useNow(60_000);
  const { tasks, catalogs, areaFilter, setAreaFilter, act } = useBoard();
  const done = useMemo(() => recentlyDone(groupTasks(tasks, now, areaFilter).done, now), [tasks, now, areaFilter]);
  const areas = useMemo(() => new Map(catalogs.areas.map((a) => [a.id, a])), [catalogs.areas]);
  const requesters = useMemo(() => new Map(catalogs.requesters.map((r) => [r.id, r])), [catalogs.requesters]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]} testID="done-screen">
      <Text style={styles.h1}>Completadas</Text>
      <Text style={styles.muted}>Últimos 30 días</Text>
      <AreaChips areas={catalogs.areas} selected={areaFilter} onSelect={setAreaFilter} />
      <ScrollView contentContainerStyle={{ paddingVertical: 12 }}>
        {done.length === 0 ? <Empty text="Nada completado todavía" /> : null}
        {done.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            now={now}
            area={areas.get(t.area_id)}
            requester={t.requester_id ? requesters.get(t.requester_id) : undefined}
            actions={[{ label: 'Reabrir', onPress: () => void act(() => q.reopenTask(t.id)), testID: 'reopen' }]}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16 },
  h1: { fontSize: 28, fontWeight: '800', color: colors.text, paddingTop: 12 },
  muted: { color: colors.muted, marginBottom: 8 },
});
