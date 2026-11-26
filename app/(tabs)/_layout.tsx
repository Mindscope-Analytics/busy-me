import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { BoardProvider } from '@/hooks/useBoard';

/** Gate de sesión + pestañas. Sin sesión → login (OTP por correo). */
export default function TabsLayout() {
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
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.primary,
          tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
          tabBarStyle: { height: 60, paddingBottom: 8, paddingTop: 6 },
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Ahora', tabBarIcon: ({ color }) => <TabGlyph color={color} glyph="●" /> }} />
        <Tabs.Screen name="done" options={{ title: 'Completadas', tabBarIcon: ({ color }) => <TabGlyph color={color} glyph="✓" /> }} />
        <Tabs.Screen name="settings" options={{ title: 'Ajustes', tabBarIcon: ({ color }) => <TabGlyph color={color} glyph="⚙" /> }} />
      </Tabs>
    </BoardProvider>
  );
}

function TabGlyph({ color, glyph }: { color: string; glyph: string }) {
  return <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
}

const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
