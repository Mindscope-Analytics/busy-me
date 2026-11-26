import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

export const colors = {
  text: '#18181b',
  muted: '#71717a',
  border: '#e4e4e7',
  surface: '#ffffff',
  background: '#fafafa',
  primary: '#18181b',
  overdue: '#b91c1c',
  overdueBg: '#fef2f2',
  soon: '#b45309',
  soonBg: '#fffbeb',
  ok: '#15803d',
  active: '#1d4ed8',
  activeBg: '#eff6ff',
};

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

/** Botón accesible de ≥ 44 px de alto (regla de P-008). */
export function Button({
  label,
  onPress,
  variant = 'secondary',
  disabled,
  testID,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.primary,
        variant === 'danger' && styles.danger,
        variant === 'ghost' && styles.ghost,
        (pressed || disabled) && styles.dim,
        style,
      ]}
    >
      <Text style={[styles.buttonText, (variant === 'primary' || variant === 'danger') && styles.buttonTextLight]}>{label}</Text>
    </Pressable>
  );
}

/** Chip seleccionable (filtros de área, prioridad, fechas rápidas). */
export function Chip({
  label,
  selected,
  color,
  onPress,
  testID,
}: {
  label: string;
  selected?: boolean;
  color?: string;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      testID={testID}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected: !!selected }}
      style={[styles.chip, selected && styles.chipSelected, color ? { borderColor: color } : null]}
    >
      {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export function SectionHeader({ title, count, right }: { title: string; count?: number; right?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>
        {title}
        {count !== undefined ? ` (${count})` : ''}
      </Text>
      {right}
    </View>
  );
}

export function Banner({
  tone,
  text,
  actions,
  testID,
}: {
  tone: 'warn' | 'info';
  text: string;
  actions: ReactNode;
  testID?: string;
}) {
  return (
    <View style={[styles.banner, tone === 'warn' ? styles.bannerWarn : styles.bannerInfo]} testID={testID}>
      <Text style={styles.bannerText}>{text}</Text>
      <View style={styles.row}>{actions}</View>
    </View>
  );
}

export function Empty({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
}

export const styles = StyleSheet.create({
  button: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  danger: { backgroundColor: colors.overdue, borderColor: colors.overdue },
  ghost: { borderColor: 'transparent', backgroundColor: 'transparent' },
  dim: { opacity: 0.6 },
  buttonText: { fontWeight: '600', color: colors.text, fontSize: 15 },
  buttonTextLight: { color: '#fff' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: 14 },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20, marginBottom: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  banner: { borderRadius: 12, padding: 12, gap: 10, borderWidth: 1, marginBottom: 10 },
  bannerWarn: { backgroundColor: colors.soonBg, borderColor: '#fcd34d' },
  bannerInfo: { backgroundColor: colors.activeBg, borderColor: '#bfdbfe' },
  bannerText: { color: colors.text, fontSize: 15 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  empty: { color: colors.muted, paddingVertical: 8 },
});
