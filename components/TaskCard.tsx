import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, colors } from '@/components/ui';
import { displayedClockSeconds } from '@/lib/board';
import { daysToDue, dueLabel, dueTone, formatHm, formatHms } from '@/lib/time';
import type { Area, BoardTask, Requester, WorkType } from '@/lib/types';

export interface TaskCardProps {
  task: BoardTask;
  now: Date;
  area?: Area;
  requester?: Requester;
  workType?: WorkType;
  /** Botones de acción (Activar, Pausar, Finalizar…), ya decididos por la pantalla. */
  actions: { label: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger'; testID?: string }[];
  onOpen?: () => void;
}

const PRIORITY_LABEL: Record<number, string> = { 1: 'Alta', 2: 'Media', 3: 'Baja' };

/** Tarjeta: título, chip de área, solicitante, tipo (si el área lo pide), vencimiento y reloj. */
export const TaskCard = memo(function TaskCard({ task, now, area, requester, workType, actions, onOpen }: TaskCardProps) {
  const days = daysToDue(task.due_date, now);
  const tone = dueTone(days);
  const clock = displayedClockSeconds(task, now);
  const meta = [requester?.name, area?.track_by_type ? workType?.name : undefined, task.priority !== 2 ? `Prioridad ${PRIORITY_LABEL[task.priority]}` : undefined]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={[styles.card, task.is_active && styles.cardActive]} testID={`task-${task.id}`} accessibilityLabel={task.title}>
      <Pressable onPress={onOpen} disabled={!onOpen} accessibilityRole={onOpen ? 'button' : undefined} style={styles.body} testID="open-task">
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>
            {task.title}
          </Text>
          {area ? (
            <View style={[styles.areaChip, { backgroundColor: area.color }]}>
              <Text style={styles.areaChipText}>{area.name}</Text>
            </View>
          ) : null}
        </View>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
        <View style={styles.footer}>
          {days !== null ? (
            <Text style={[styles.due, tone === 'overdue' && styles.dueOverdue, tone === 'soon' && styles.dueSoon]} testID="due">
              {dueLabel(days)}
            </Text>
          ) : (
            <Text style={styles.due}>sin fecha</Text>
          )}
          <Text style={[styles.clock, task.is_active && styles.clockActive]} testID="clock">
            {task.is_active ? formatHms(clock) : formatHm(clock)}
          </Text>
        </View>
      </Pressable>
      {actions.length ? (
        <View style={styles.actions}>
          {actions.map((a) => (
            <Button key={a.label} label={a.label} onPress={a.onPress} variant={a.variant ?? 'secondary'} testID={a.testID} style={styles.action} />
          ))}
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 10,
    marginBottom: 8,
  },
  cardActive: { borderColor: '#93c5fd', backgroundColor: colors.activeBg },
  body: { gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  areaChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  areaChipText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  meta: { color: colors.muted, fontSize: 13 },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  due: { color: colors.muted, fontSize: 13 },
  dueOverdue: { color: colors.overdue, fontWeight: '700' },
  dueSoon: { color: colors.soon, fontWeight: '600' },
  clock: { color: colors.muted, fontSize: 13, fontVariant: ['tabular-nums'] },
  clockActive: { color: colors.active, fontWeight: '700', fontSize: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { flexGrow: 1 },
});
