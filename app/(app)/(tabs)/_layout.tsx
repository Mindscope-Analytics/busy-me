import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '@/components/ui';

/** Pestañas del tablero. El gate de sesión y el BoardProvider están en app/(app)/_layout.tsx. */
export default function TabsLayout() {
  return (
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
  );
}

function TabGlyph({ color, glyph }: { color: string; glyph: string }) {
  return <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
}
