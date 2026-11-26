import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Chip, Empty, SectionHeader, colors } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useBoard } from '@/hooks/useBoard';
import { confirmAsync } from '@/lib/confirm';
import * as q from '@/lib/queries';
import type { Area } from '@/lib/types';

const AREA_COLORS = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#db2777', '#ca8a04', '#475569'];

/** Ajustes: CRUD de áreas (nombre, color, track_by_type), solicitantes y tipos por área. */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { catalogs, act, error } = useBoard();
  const [selected, setSelected] = useState<string | null>(null);
  const [newAreaName, setNewAreaName] = useState('');
  const area = catalogs.areas.find((a) => a.id === selected) ?? catalogs.areas[0];

  async function addArea() {
    const ok = await act(() =>
      q.createArea({ name: newAreaName, color: AREA_COLORS[catalogs.areas.length % AREA_COLORS.length], track_by_type: false })
    );
    if (ok) setNewAreaName('');
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]} testID="settings-screen">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.h1}>Ajustes</Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <SectionHeader title="Áreas" count={catalogs.areas.length} />
        {catalogs.areas.length === 0 ? (
          <>
            <Empty text="Sin áreas todavía." />
            <Button label="Crear Trabajo, Personal y Estudios" variant="primary" onPress={() => void act(() => q.createDefaultAreas())} />
          </>
        ) : null}
        <View style={styles.wrap}>
          {catalogs.areas.map((a) => (
            <Chip key={a.id} label={a.name} color={a.color} selected={area?.id === a.id} onPress={() => setSelected(a.id)} testID={`settings-area-${a.name}`} />
          ))}
        </View>
        <View style={styles.row}>
          <TextInput style={[styles.input, styles.grow]} placeholder="Nueva área" value={newAreaName} onChangeText={setNewAreaName} maxLength={60} onSubmitEditing={() => void addArea()} testID="new-area-name" />
          <Button label="Añadir" variant="primary" onPress={() => void addArea()} disabled={newAreaName.trim() === ''} testID="add-area" />
        </View>

        {area ? <AreaEditor key={area.id} area={area} /> : null}

        <SectionHeader title="Cuenta" />
        <Text style={styles.muted}>{user?.email}</Text>
        <Button label="Cerrar sesión" onPress={() => void signOut()} testID="sign-out" style={{ alignSelf: 'flex-start' }} />
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

function AreaEditor({ area }: { area: Area }) {
  const { catalogs, act } = useBoard();
  const [name, setName] = useState(area.name);
  const lastSaved = useRef(area.name);
  function saveName() {
    if (name === lastSaved.current) return; // Enter + blur en el mismo render → un solo update
    lastSaved.current = name;
    void act(() => q.updateArea(area.id, { name }));
  }
  const requesters = catalogs.requesters.filter((r) => r.area_id === area.id);
  const workTypes = catalogs.workTypes.filter((w) => w.area_id === area.id);

  async function remove() {
    if (await confirmAsync('Borrar área', `Se borra "${area.name}" con sus solicitantes y tipos. Si tiene tareas, no se puede borrar.`, 'Borrar')) {
      await act(() => q.deleteArea(area.id));
    }
  }

  return (
    <View style={styles.card} testID="area-editor">
      <Text style={styles.label}>Nombre</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        maxLength={60}
        onBlur={saveName}
        onSubmitEditing={saveName}
        testID="area-name"
      />
      <Text style={styles.label}>Color</Text>
      <View style={styles.wrap}>
        {AREA_COLORS.map((c) => (
          <Chip key={c} label=" " color={c} selected={area.color === c} onPress={() => void act(() => q.updateArea(area.id, { color: c }))} />
        ))}
      </View>
      <View style={styles.switchRow}>
        <Text style={styles.text}>Clasificar tareas por tipo de trabajo</Text>
        <Switch value={area.track_by_type} onValueChange={(v) => void act(() => q.updateArea(area.id, { track_by_type: v }))} testID="track-by-type" />
      </View>

      <CatalogList
        title="Solicitantes"
        items={requesters}
        onAdd={(n) => act(() => q.createRequester(area.id, n))}
        onRename={(id, n) => act(() => q.renameRequester(id, n))}
        onDelete={(id) => act(() => q.deleteRequester(id))}
        testID="requesters"
      />
      {area.track_by_type ? (
        <CatalogList
          title="Tipos de trabajo"
          items={workTypes}
          onAdd={(n) => act(() => q.createWorkType(area.id, n))}
          onRename={(id, n) => act(() => q.renameWorkType(id, n))}
          onDelete={(id) => act(() => q.deleteWorkType(id))}
          testID="work-types"
        />
      ) : null}

      <Button label="Borrar área" variant="danger" onPress={() => void remove()} style={{ alignSelf: 'flex-start', marginTop: 12 }} testID="delete-area" />
    </View>
  );
}

function CatalogList({
  title,
  items,
  onAdd,
  onRename,
  onDelete,
  testID,
}: {
  title: string;
  items: { id: string; name: string }[];
  onAdd: (name: string) => Promise<boolean>;
  onRename: (id: string, name: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  testID: string;
}) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  async function add() {
    if (await onAdd(draft)) setDraft('');
  }
  return (
    <View testID={testID}>
      <Text style={styles.label}>{title}</Text>
      {items.length === 0 ? <Empty text="Ninguno todavía." /> : null}
      {items.map((it) => (
        <View key={it.id} style={styles.row}>
          {editing?.id === it.id ? (
            <>
              <TextInput style={[styles.input, styles.grow]} value={editing.name} onChangeText={(v) => setEditing({ id: it.id, name: v })} maxLength={80} autoFocus />
              <Button
                label="Guardar"
                variant="primary"
                onPress={async () => {
                  if (await onRename(it.id, editing.name)) setEditing(null);
                }}
              />
            </>
          ) : (
            <>
              <Text style={[styles.text, styles.grow]}>{it.name}</Text>
              <Button label="Renombrar" variant="ghost" onPress={() => setEditing({ id: it.id, name: it.name })} />
              <Button label="Borrar" variant="ghost" onPress={() => void onDelete(it.id)} />
            </>
          )}
        </View>
      ))}
      <View style={styles.row}>
        <TextInput style={[styles.input, styles.grow]} placeholder={`Nuevo en ${title.toLowerCase()}`} value={draft} onChangeText={setDraft} maxLength={80} onSubmitEditing={() => void add()} />
        <Button label="Añadir" onPress={() => void add()} disabled={draft.trim() === ''} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 16, paddingBottom: 24, gap: 8, maxWidth: 640, width: '100%', alignSelf: 'center' },
  h1: { fontSize: 28, fontWeight: '800', color: colors.text, paddingTop: 12 },
  label: { fontSize: 13, fontWeight: '700', color: colors.muted, marginTop: 12, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, fontSize: 16, backgroundColor: colors.surface, minHeight: 44 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  grow: { flex: 1 },
  card: { gap: 4, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginTop: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, minHeight: 44 },
  text: { fontSize: 15, color: colors.text },
  muted: { color: colors.muted },
  error: { color: colors.overdue },
});
