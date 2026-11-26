import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, colors } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';

/** Ajustes mínimos. El CRUD de áreas, solicitantes y tipos llega en el bloque 3. */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]} testID="settings-screen">
      <Text style={styles.h1}>Ajustes</Text>
      <Text style={styles.muted}>{user?.email}</Text>
      <Button label="Cerrar sesión" onPress={() => void signOut()} testID="sign-out" style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16, gap: 12 },
  h1: { fontSize: 28, fontWeight: '800', color: colors.text, paddingTop: 12 },
  muted: { color: colors.muted },
});
