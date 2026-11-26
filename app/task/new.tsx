import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Button, Chip, colors } from '@/components/ui';
import { useBoard } from '@/hooks/useBoard';
import * as q from '@/lib/queries';
import { addDays, toBusinessDate } from '@/lib/time';
import type { Priority } from '@/lib/types';

const AREA_COLORS = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#db2777', '#ca8a04', '#475569'];

/** Alta de tarea. Solicitante, tipo y área se pueden crear en línea. */
export default function NewTaskScreen() {
  const { catalogs, refresh, setNotice } = useBoard();
  const today = toBusinessDate(new Date());

  const [title, setTitle] = useState('');
  const [areaId, setAreaId] = useState<string | null>(catalogs.areas[0]?.id ?? null);
  const [requesterId, setRequesterId] = useState<string | null>(null);
  const [workTypeId, setWorkTypeId] = useState<string | null>(null);
  const [due, setDue] = useState<string>('');
  const [priority, setPriority] = useState<Priority>(2);
  const [startNow, setStartNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Altas en línea
  const [newArea, setNewArea] = useState<{ name: string; color: string; track: boolean } | null>(null);
  const [newRequester, setNewRequester] = useState<string | null>(null);
  const [newType, setNewType] = useState<string | null>(null);

  const area = useMemo(() => catalogs.areas.find((a) => a.id === areaId), [catalogs.areas, areaId]);
  const requesters = useMemo(() => catalogs.requesters.filter((r) => r.area_id === areaId), [catalogs.requesters, areaId]);
  const workTypes = useMemo(() => catalogs.workTypes.filter((w) => w.area_id === areaId), [catalogs.workTypes, areaId]);

  function pickArea(id: string) {
    setAreaId(id);
    setRequesterId(null);
    setWorkTypeId(null);
  }

  async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError('');
    try {
      const r = await fn();
      await refresh();
      return r;
    } catch (e) {
      setError(q.errorMessage(e));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function saveArea() {
    if (!newArea) return;
    const created = await run(() => q.createArea({ name: newArea.name, color: newArea.color, track_by_type: newArea.track }));
    if (created) {
      pickArea(created.id);
      setNewArea(null);
    }
  }
  async function saveRequester() {
    if (!areaId || newRequester === null) return;
    const created = await run(() => q.createRequester(areaId, newRequester));
    if (created) {
      setRequesterId(created.id);
      setNewRequester(null);
    }
  }
  async function saveType() {
    if (!areaId || newType === null) return;
    const created = await run(() => q.createWorkType(areaId, newType));
    if (created) {
      setWorkTypeId(created.id);
      setNewType(null);
    }
  }

  async function save() {
    if (!areaId) return setError('Elige o crea un área.');
    const created = await run(() =>
      q.createTask(
        {
          title,
          area_id: areaId,
          requester_id: requesterId,
          work_type_id: area?.track_by_type ? workTypeId : null,
          project_id: null,
          due_date: due.trim() === '' ? null : due.trim(),
          priority,
          notes: null,
        },
        startNow
      )
    );
    if (created) {
      if (created.startError) setNotice(created.startError);
      router.back();
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="new-task-form">
        <Text style={styles.label}>Título</Text>
        <TextInput
          testID="title"
          style={styles.input}
          placeholder="¿Qué hay que hacer?"
          value={title}
          onChangeText={setTitle}
          autoFocus
          maxLength={200}
          onSubmitEditing={() => void save()}
        />

        <Text style={styles.label}>Área</Text>
        <View style={styles.wrap}>
          {catalogs.areas.map((a) => (
            <Chip key={a.id} label={a.name} color={a.color} selected={a.id === areaId} onPress={() => pickArea(a.id)} testID={`area-${a.name}`} />
          ))}
          <Chip label="+ Nueva área" onPress={() => setNewArea({ name: '', color: AREA_COLORS[catalogs.areas.length % AREA_COLORS.length], track: false })} />
        </View>
        {newArea ? (
          <View style={styles.inline}>
            <TextInput style={styles.input} placeholder="Nombre del área" value={newArea.name} onChangeText={(v) => setNewArea({ ...newArea, name: v })} maxLength={60} />
            <View style={styles.wrap}>
              {AREA_COLORS.map((c) => (
                <Chip key={c} label=" " color={c} selected={newArea.color === c} onPress={() => setNewArea({ ...newArea, color: c })} />
              ))}
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.text}>Clasificar por tipo de trabajo</Text>
              <Switch value={newArea.track} onValueChange={(v) => setNewArea({ ...newArea, track: v })} />
            </View>
            <View style={styles.wrap}>
              <Button label="Guardar área" variant="primary" onPress={() => void saveArea()} disabled={busy} />
              <Button label="Cancelar" variant="ghost" onPress={() => setNewArea(null)} />
            </View>
          </View>
        ) : null}

        {areaId ? (
          <>
            <Text style={styles.label}>Solicitante</Text>
            <View style={styles.wrap}>
              <Chip label="Nadie" selected={requesterId === null} onPress={() => setRequesterId(null)} />
              {requesters.map((r) => (
                <Chip key={r.id} label={r.name} selected={r.id === requesterId} onPress={() => setRequesterId(r.id)} />
              ))}
              <Chip label="+ Nuevo" onPress={() => setNewRequester('')} testID="new-requester" />
            </View>
            {newRequester !== null ? (
              <View style={styles.inline}>
                <TextInput style={styles.input} placeholder="Nombre del solicitante" value={newRequester} onChangeText={setNewRequester} maxLength={80} onSubmitEditing={() => void saveRequester()} testID="requester-name" />
                <View style={styles.wrap}>
                  <Button label="Guardar solicitante" variant="primary" onPress={() => void saveRequester()} disabled={busy} testID="save-requester" />
                  <Button label="Cancelar" variant="ghost" onPress={() => setNewRequester(null)} />
                </View>
              </View>
            ) : null}
          </>
        ) : null}

        {area?.track_by_type ? (
          <>
            <Text style={styles.label}>Tipo de trabajo</Text>
            <View style={styles.wrap}>
              <Chip label="Sin tipo" selected={workTypeId === null} onPress={() => setWorkTypeId(null)} />
              {workTypes.map((w) => (
                <Chip key={w.id} label={w.name} selected={w.id === workTypeId} onPress={() => setWorkTypeId(w.id)} />
              ))}
              <Chip label="+ Nuevo" onPress={() => setNewType('')} />
            </View>
            {newType !== null ? (
              <View style={styles.inline}>
                <TextInput style={styles.input} placeholder="Nombre del tipo" value={newType} onChangeText={setNewType} maxLength={80} onSubmitEditing={() => void saveType()} />
                <View style={styles.wrap}>
                  <Button label="Guardar tipo" variant="primary" onPress={() => void saveType()} disabled={busy} />
                  <Button label="Cancelar" variant="ghost" onPress={() => setNewType(null)} />
                </View>
              </View>
            ) : null}
          </>
        ) : null}

        <Text style={styles.label}>Vence</Text>
        <View style={styles.wrap}>
          <Chip label="Sin fecha" selected={due === ''} onPress={() => setDue('')} />
          <Chip label="Hoy" selected={due === today} onPress={() => setDue(today)} />
          <Chip label="Mañana" selected={due === addDays(today, 1)} onPress={() => setDue(addDays(today, 1))} />
          <Chip label="+3 d" selected={due === addDays(today, 3)} onPress={() => setDue(addDays(today, 3))} />
          <Chip label="+1 sem" selected={due === addDays(today, 7)} onPress={() => setDue(addDays(today, 7))} />
        </View>
        <TextInput testID="due" style={styles.input} placeholder="AAAA-MM-DD" value={due} onChangeText={setDue} autoCapitalize="none" maxLength={10} />

        <Text style={styles.label}>Prioridad</Text>
        <View style={styles.wrap}>
          {([1, 2, 3] as Priority[]).map((p) => (
            <Chip key={p} label={p === 1 ? 'Alta' : p === 2 ? 'Media' : 'Baja'} selected={priority === p} onPress={() => setPriority(p)} />
          ))}
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.text}>Iniciar al guardar (arranca el cronómetro)</Text>
          <Switch value={startNow} onValueChange={setStartNow} testID="start-now" />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={busy ? 'Guardando…' : 'Guardar tarea'} variant="primary" onPress={() => void save()} disabled={busy} testID="save-task" />
        <Button label="Cancelar" variant="ghost" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 8, maxWidth: 560, width: '100%', alignSelf: 'center' },
  label: { fontSize: 13, fontWeight: '700', color: colors.muted, marginTop: 12, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: colors.surface, minHeight: 44 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inline: { gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, minHeight: 44 },
  text: { fontSize: 15, color: colors.text, flex: 1 },
  error: { color: colors.overdue },
});
