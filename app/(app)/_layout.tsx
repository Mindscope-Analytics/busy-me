import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import { BoardProvider } from '@/hooks/useBoard';

/**
 * Grupo autenticado: gate de sesión + BoardProvider para TODAS las rutas que usan useBoard
 * (pestañas, task/new y task/[id]). Una sola instancia → una sola suscripción Realtime.
 * Sin sesión → login (OTP por correo).
 */
export default function AppLayout() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <View style={styles.center} testID="loading">
        <ActivityIndicator />
      </View>
    );
  }
  if (!user) return <Redirect href="/auth/login" />;
  return (
    <BoardProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ title: 'Ahora' }} />
        <Stack.Screen name="task/new" options={{ presentation: 'modal', headerShown: true, title: 'Nueva tarea' }} />
        <Stack.Screen name="task/[id]" options={{ headerShown: true, title: 'Tarea' }} />
      </Stack>
    </BoardProvider>
  );
}

const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
