import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/hooks/useAuth';

/**
 * Raíz: solo AuthProvider. Las rutas autenticadas (tablero, alta y detalle de tarea) viven en el
 * grupo `(app)`, cuyo layout hace el gate de sesión y monta el único BoardProvider (ADR-0007).
 */
export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(app)" />
        <Stack.Screen name="auth/login" />
        <Stack.Screen name="auth/verify" />
      </Stack>
    </AuthProvider>
  );
}
