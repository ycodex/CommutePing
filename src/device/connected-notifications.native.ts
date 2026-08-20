import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { PushRegistrationResult } from './connected-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerConnectedNotifications(): Promise<PushRegistrationResult> {
  if (!Device.isDevice || (Platform.OS !== 'android' && Platform.OS !== 'ios')) {
    return { ok: false, reason: 'unsupported' };
  }
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('commute-alerts', {
        name: 'Commute alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 180, 250],
        lightColor: '#EF394B',
        sound: 'default',
      });
    }
    const existing = await Notifications.getPermissionsAsync();
    const permission = existing.granted ? existing : await Notifications.requestPermissionsAsync();
    if (!permission.granted) return { ok: false, reason: 'denied' };
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (typeof projectId !== 'string' || projectId.length > 80) return { ok: false, reason: 'unavailable' };
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return { ok: true, token: token.data, platform: Platform.OS };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

export function subscribeToConnectedNotifications(listener: () => void): () => void {
  const received = Notifications.addNotificationReceivedListener(listener);
  const responded = Notifications.addNotificationResponseReceivedListener(listener);
  return () => {
    received.remove();
    responded.remove();
  };
}
