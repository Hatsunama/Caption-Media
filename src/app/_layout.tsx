import { useFonts } from 'expo-font';
import { Stack } from 'expo-router/stack';

import { FONT_ASSETS } from '@/lib/font-catalog';

export default function RootLayout() {
  const [fontsLoaded] = useFonts(FONT_ASSETS);

  if (!fontsLoaded) return null;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#090B0E' },
        headerTintColor: '#F7F8FA',
        headerShadowVisible: false,
        contentStyle: { backgroundColor: '#090B0E' },
      }}>
      <Stack.Screen name="index" options={{ title: 'Caption Studio' }} />
      <Stack.Screen
        name="editor"
        options={{
          title: 'Editor',
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
    </Stack>
  );
}
