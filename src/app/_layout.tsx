import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import '@/tasks/connected-location-task';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#1A1A1D' } }} />;
}
