import { ScrollView, StyleSheet } from 'react-native';
import { Chip } from '@/components/ui';
import type { Area } from '@/lib/types';

/** Filtro por área: "Todas" + un chip por área con su color. */
export function AreaChips({ areas, selected, onSelect }: { areas: Area[]; selected: string | null; onSelect: (id: string | null) => void }) {
  if (areas.length < 2) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} testID="area-filter">
      <Chip label="Todas" selected={selected === null} onPress={() => onSelect(null)} />
      {areas.map((a) => (
        <Chip key={a.id} label={a.name} color={a.color} selected={selected === a.id} onPress={() => onSelect(selected === a.id ? null : a.id)} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({ row: { gap: 8, paddingVertical: 4 } });
