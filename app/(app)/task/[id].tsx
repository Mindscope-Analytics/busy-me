import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Chip, Empty, SectionHeader, colors } from '@/components/ui';
import { useBoard } from '@/hooks/useBoard';
import { useNow } from '@/hooks/useNow';
import { displayedClockSeconds } from '@/lib/board';
import { confirmAsync } from '@/lib/confirm';
import * as q from '@/lib/queries';
import { formatBusinessDateTime, formatHm, formatHms, parseBusinessDateTime, secondsSince } from '@/lib/time';
import type { Priority, TimeEntry } from '@/lib/types';

/** Detalle de tarea: edición de campos y lista de tramos editable (los cerrados). */
export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const now = useNow();
  const { tasks, catalogs, act, refresh } = useBoard();
  const task = useMemo(() => tasks.find((t) => t.id === id), [tasks, id]);

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [allocated, setAllocated] = useState<Map<string, number>>(new Map());
  const [error, setError] = useState('');

  const loadEntries = useCallback(async () => {
    if (!id) return;
    try {
      const [e, a] = await Promise.all([q.fetchTimeEntries(id), q.fetchAllocated(id)]);
      setEntries(e);
      const m = new Map<string, number>();
      for (const row of a) m.set(row.time_entry_id, (m.get(row.time_entry_id) ?? 0) + row.allocated_seconds);
      setAllocated(m);
    } catch (err) {
      setError(q.errorMessage(err));
    }
  }, [id]);

  // tasks cambia con cada evento Realtime (tramos incluidos): recarga la lista con él.
  useEffect(() => {
    void loadEntries();
  }, [loadEntries, tasks]);

  // Tras una acción basta con refresh(): el efecto de arriba recarga los tramos al cambiar `tasks`.
  async function run(fn: () => Promise<unknown>) {
    setError('');
    try {
      await fn();
      await refresh();
      return true;
    } catch (err) {
      setError(q.errorMessage(err));
      return false;
    }
  }

  if (!task) {
    return (
      <View style={styles.center}>
        <Empty text="La tarea ya no existe." />
        <Button label="Volver" onPress={() => router.back()} />
      </View>
    );
  }

  const area = catalogs.areas.find((a) => a.id === task.area_id);
  const requesters = catalogs.requesters.filter((r) => r.area_id === task.area_id);
  const workTypes = catalogs.workTypes.filter((w) => w.area_id === task.area_id);
  const clock = displayedClockSeconds(task, now);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="task-detail">
      <Field label="Título" value={task.title} onSave={(v) => run(() => q.updateTask(task.id, { title: v }))} testID="detail-title" />
      <Field label="Notas" value={task.notes ?? ''} multiline onSave={(v) => run(() => q.updateTask(task.id, { notes: v.trim() === '' ? null : v }))} />
      <Field
        label="Vence (AAAA-MM-DD, vacío = sin fecha)"
        value={task.due_date ?? ''}
        onSave={(v) => run(() => q.updateTask(task.id, { due_date: v.trim() === '' ? null : v.trim() }))}
      />

      <Text style={styles.label}>Prioridad</Text>
      <View style={styles.wrap}>
        {([1, 2, 3] as Priority[]).map((p) => (
          <Chip key={p} label={p === 1 ? 'Alta' : p === 2 ? 'Media' : 'Baja'} selected={task.priority === p} onPress={() => void run(() => q.updateTask(task.id, { priority: p }))} />
        ))}
      </View>

      <Text style={styles.label}>Área</Text>
      <View style={styles.wrap}>
        {catalogs.areas.map((a) => (
          <Chip
            key={a.id}
            label={a.name}
            color={a.color}
            selected={a.id === task.area_id}
            onPress={() => void run(() => q.updateTask(task.id, { area_id: a.id, requester_id: null, work_type_id: null }))}
          />
        ))}
      </View>

      <Text style={styles.label}>Solicitante</Text>
      <View style={styles.wrap}>
        <Chip label="Nadie" selected={task.requester_id === null} onPress={() => void run(() => q.updateTask(task.id, { requester_id: null }))} />
        {requesters.map((r) => (
          <Chip key={r.id} label={r.name} selected={r.id === task.requester_id} onPress={() => void run(() => q.updateTask(task.id, { requester_id: r.id }))} />
        ))}
      </View>

      {area?.track_by_type ? (
        <>
          <Text style={styles.label}>Tipo de trabajo</Text>
          <View style={styles.wrap}>
            <Chip label="Sin tipo" selected={task.work_type_id === null} onPress={() => void run(() => q.updateTask(task.id, { work_type_id: null }))} />
            {workTypes.map((w) => (
              <Chip key={w.id} label={w.name} selected={w.id === task.work_type_id} onPress={() => void run(() => q.updateTask(task.id, { work_type_id: w.id }))} />
            ))}
          </View>
        </>
      ) : null}

      <SectionHeader title="Tiempo" />
      <Text style={styles.totals} testID="totals">
        Reloj {task.is_active ? formatHms(clock) : formatHm(clock)} · Asignado {formatHm(task.total_allocated_seconds)}
      </Text>
      <Text style={styles.muted} testID="task-status">
        Estado: {task.status === 'backlog' ? 'por iniciar' : task.status === 'started' ? (task.is_active ? 'activa' : 'pendiente') : task.status === 'done' ? 'completada' : 'cancelada'}
      </Text>
      <View style={styles.wrap}>
        {task.status === 'done' ? (
          <Button label="Reabrir" onPress={() => void act(() => q.reopenTask(task.id))} />
        ) : (
          <>
            {task.is_active ? (
              <Button label="Pausar" onPress={() => void act(() => q.pauseTask(task.id))} />
            ) : (
              <Button label="Activar" variant="primary" onPress={() => void act(() => q.activateTask(task.id))} />
            )}
            <Button label="Finalizar" onPress={() => void act(() => q.completeTask(task.id))} />
          </>
        )}
      </View>

      <SectionHeader title="Tramos" count={entries.length} />
      <Text style={styles.muted}>Hora de la Ciudad de México. Los tramos en curso se editan después de pausarlos.</Text>
      {entries.map((e) => (
        <EntryRow
          key={e.id}
          entry={e}
          now={now}
          allocated={allocated.get(e.id)}
          onSave={(patch) => run(() => q.updateTimeEntry(e.id, patch))}
          onDelete={async () => {
            if (await confirmAsync('Borrar tramo', 'Se borra el tiempo registrado en este tramo.', 'Borrar')) await run(() => q.deleteTimeEntry(e.id));
          }}
        />
      ))}
      <ManualEntry now={now} onAdd={(started_at, ended_at, note) => run(() => q.insertManualEntry({ task_id: task.id, started_at, ended_at, note }))} />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <SectionHeader title="Peligro" />
      <Button
        label="Borrar tarea"
        variant="danger"
        onPress={async () => {
          if (await confirmAsync('Borrar tarea', `Se borra "${task.title}" y todos sus tramos.`, 'Borrar')) {
            if (await run(() => q.deleteTask(task.id))) router.back();
          }
        }}
        testID="delete-task"
      />
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

/** Campo de texto con guardado al salir / Enter. */
function Field({ label, value, onSave, multiline, testID }: { label: string; value: string; onSave: (v: string) => Promise<boolean>; multiline?: boolean; testID?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  // Enter dispara onSubmitEditing y luego onBlur en el mismo render: se guarda una sola vez.
  const lastSaved = useRef(value);
  useEffect(() => {
    lastSaved.current = value;
  }, [value]);
  function save() {
    if (draft === lastSaved.current) return;
    lastSaved.current = draft;
    void onSave(draft);
  }
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multiline]}
        value={draft}
        onChangeText={setDraft}
        multiline={multiline}
        onBlur={save}
        onSubmitEditing={save}
        blurOnSubmit={!multiline}
        testID={testID}
      />
    </View>
  );
}

function EntryRow({
  entry,
  now,
  allocated,
  onSave,
  onDelete,
}: {
  entry: TimeEntry;
  now: Date;
  allocated?: number;
  onSave: (patch: { started_at: string; ended_at: string; note: string | null }) => Promise<boolean>;
  onDelete: () => Promise<void>;
}) {
  const open = entry.ended_at === null;
  const [start, setStart] = useState(formatBusinessDateTime(new Date(entry.started_at)));
  const [end, setEnd] = useState(entry.ended_at ? formatBusinessDateTime(new Date(entry.ended_at)) : '');
  const [note, setNote] = useState(entry.note ?? '');
  const [err, setErr] = useState('');
  useEffect(() => {
    setStart(formatBusinessDateTime(new Date(entry.started_at)));
    setEnd(entry.ended_at ? formatBusinessDateTime(new Date(entry.ended_at)) : '');
    setNote(entry.note ?? '');
  }, [entry]);
  const seconds = open ? secondsSince(entry.started_at, now) : (entry.duration_seconds ?? 0);

  async function save() {
    const s = parseBusinessDateTime(start);
    const e = parseBusinessDateTime(end);
    if (!s || !e) return setErr('Formato: AAAA-MM-DD HH:mm');
    if (e <= s) return setErr('El fin debe ser posterior al inicio.');
    setErr('');
    await onSave({ started_at: s.toISOString(), ended_at: e.toISOString(), note: note.trim() === '' ? null : note.trim() });
  }

  return (
    <View style={[styles.entry, open && styles.entryOpen]} testID="time-entry">
      <View style={styles.entryHeader}>
        <Text style={styles.entryClock}>
          {open ? `En curso · ${formatHms(seconds)}` : `Reloj ${formatHm(seconds)}`}
          {!open && allocated !== undefined ? ` · Asignado ${formatHm(allocated)}` : ''}
        </Text>
        {!open ? <Button label="Borrar" variant="ghost" onPress={() => void onDelete()} /> : null}
      </View>
      {open ? (
        <Text style={styles.muted}>Inicio {start}</Text>
      ) : (
        <>
          <View style={styles.wrap}>
            <TextInput style={[styles.input, styles.half]} value={start} onChangeText={setStart} placeholder="Inicio AAAA-MM-DD HH:mm" autoCapitalize="none" />
            <TextInput style={[styles.input, styles.half]} value={end} onChangeText={setEnd} placeholder="Fin AAAA-MM-DD HH:mm" autoCapitalize="none" />
          </View>
          <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Nota (opcional)" maxLength={500} />
          {err ? <Text style={styles.error}>{err}</Text> : null}
          <Button label="Guardar tramo" onPress={() => void save()} />
        </>
      )}
    </View>
  );
}

function ManualEntry({ now, onAdd }: { now: Date; onAdd: (started_at: string, ended_at: string, note: string | null) => Promise<boolean> }) {
  const [openForm, setOpenForm] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  function begin() {
    const e = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
    setEnd(formatBusinessDateTime(e));
    setStart(formatBusinessDateTime(new Date(e.getTime() - 3_600_000)));
    setOpenForm(true);
  }
  async function add() {
    const s = parseBusinessDateTime(start);
    const e = parseBusinessDateTime(end);
    if (!s || !e) return setErr('Formato: AAAA-MM-DD HH:mm');
    if (e <= s) return setErr('El fin debe ser posterior al inicio.');
    setErr('');
    if (await onAdd(s.toISOString(), e.toISOString(), note.trim() === '' ? null : note.trim())) {
      setOpenForm(false);
      setNote('');
    }
  }
  if (!openForm) return <Button label="+ Agregar tramo manual" onPress={begin} testID="add-entry" />;
  return (
    <View style={styles.entry} testID="manual-entry">
      <View style={styles.wrap}>
        <TextInput style={[styles.input, styles.half]} value={start} onChangeText={setStart} placeholder="Inicio AAAA-MM-DD HH:mm" autoCapitalize="none" testID="entry-start" />
        <TextInput style={[styles.input, styles.half]} value={end} onChangeText={setEnd} placeholder="Fin AAAA-MM-DD HH:mm" autoCapitalize="none" testID="entry-end" />
      </View>
      <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Nota (opcional)" maxLength={500} testID="entry-note" />
      {err ? <Text style={styles.error}>{err}</Text> : null}
      <View style={styles.wrap}>
        <Button label="Agregar" variant="primary" onPress={() => void add()} testID="entry-add" />
        <Button label="Cancelar" variant="ghost" onPress={() => setOpenForm(false)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, maxWidth: 640, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  label: { fontSize: 13, fontWeight: '700', color: colors.muted, marginTop: 12, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: colors.surface, minHeight: 44 },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  half: { flexGrow: 1, flexBasis: 180 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  totals: { fontSize: 18, fontWeight: '700', color: colors.text },
  muted: { color: colors.muted },
  entry: { gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginTop: 8 },
  entryOpen: { borderColor: '#93c5fd', backgroundColor: colors.activeBg },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  entryClock: { fontWeight: '600', color: colors.text },
  error: { color: colors.overdue },
});
