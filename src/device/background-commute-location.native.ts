import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';

import { activeConnectedCommuteKey, connectedLocationTaskName } from '@/tasks/connected-location-task';
import type { BackgroundTrackingResult } from './background-commute-location';

export async function prepareBackgroundCommuteTracking(): Promise<BackgroundTrackingResult> {
  try {
    const foreground = await Location.getForegroundPermissionsAsync();
    if (!foreground.granted) return 'denied';
    const existing = await Location.getBackgroundPermissionsAsync();
    const permission = existing.granted ? existing : await Location.requestBackgroundPermissionsAsync();
    if (!permission.granted) return 'denied';
    const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(connectedLocationTaskName);
    if (!alreadyStarted) {
      await Location.startLocationUpdatesAsync(connectedLocationTaskName, {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 25,
        timeInterval: 15_000,
        deferredUpdatesDistance: 50,
        deferredUpdatesInterval: 30_000,
        activityType: Location.ActivityType.OtherNavigation,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Commute Ping is sharing this commute',
          notificationBody: 'Location sharing stops when you end the commute.',
          notificationColor: '#3973F6',
          killServiceOnDestroy: false,
        },
      });
    }
    return 'ready';
  } catch {
    return 'unavailable';
  }
}

export async function setActiveBackgroundCommute(commuteId: string): Promise<void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(commuteId)) {
    throw new Error('Invalid active commute identifier');
  }
  await SecureStore.setItemAsync(activeConnectedCommuteKey, commuteId, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function stopBackgroundCommuteTracking(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(activeConnectedCommuteKey);
  } catch {
    // The server rejects heartbeats after completion even if local cleanup is interrupted.
  }
  try {
    if (await Location.hasStartedLocationUpdatesAsync(connectedLocationTaskName)) {
      await Location.stopLocationUpdatesAsync(connectedLocationTaskName);
    }
  } catch {
    // Clearing the active identifier prevents further server writes even if the OS task is stopping.
  }
}
