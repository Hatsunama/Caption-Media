import { Stack } from 'expo-router/stack';

export default function RootLayout() {
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
