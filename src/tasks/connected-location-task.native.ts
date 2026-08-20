import * as Battery from 'expo-battery';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';

import { getConnectedClient } from '@/backend/supabase-client';

export const connectedLocationTaskName = 'commute-ping.connected-location.v1';
export const activeConnectedCommuteKey = 'commute-ping.connected-active.v1';

TaskManager.defineTask(connectedLocationTaskName, async ({ data, error }) => {
  try {
    if (error || !isRecord(data) || !Array.isArray(data.locations) || data.locations.length === 0) return;
    const latest: unknown = data.locations.at(-1);
    if (!isLocationSample(latest)) return;
    const commuteId = await SecureStore.getItemAsync(activeConnectedCommuteKey);
    if (!commuteId || !isUuid(commuteId)) return;
    const client = getConnectedClient();
    if (!client) return;
    const { data: authData } = await client.auth.getSession();
    if (!authData.session) return;

    let batteryPercent: number | null = null;
    try {
      const level = await Battery.getBatteryLevelAsync();
      if (level >= 0 && level <= 1) batteryPercent = Math.round(level * 100);
    } catch {
      // A missing battery reading must not stop location delivery.
    }

    await client.rpc('update_commute_heartbeat', {
      p_commute_id: commuteId,
      p_latitude: latest.coords.latitude,
      p_longitude: latest.coords.longitude,
      p_accuracy_meters: typeof latest.coords.accuracy === 'number' ? latest.coords.accuracy : null,
      p_battery_percent: batteryPercent,
      p_movement_status: 'preserve',
      p_route_status: 'preserve',
      p_sequence_number: Math.max(1, Math.round(latest.timestamp)),
      p_observed_at: new Date(latest.timestamp).toISOString(),
    });
  } catch {
    // Background delivery is best-effort; never log coordinates or session data.
  }
});

type LocationSample = {
  timestamp: number;
  coords: { latitude: number; longitude: number; accuracy?: number | null };
};

function isLocationSample(value: unknown): value is LocationSample {
  if (!isRecord(value) || !isRecord(value.coords)) return false;
  return typeof value.timestamp === 'number'
    && Number.isFinite(value.timestamp)
    && typeof value.coords.latitude === 'number'
    && Number.isFinite(value.coords.latitude)
    && value.coords.latitude >= -90
    && value.coords.latitude <= 90
    && typeof value.coords.longitude === 'number'
    && Number.isFinite(value.coords.longitude)
    && value.coords.longitude >= -180
    && value.coords.longitude <= 180
    && (value.coords.accuracy === undefined
      || value.coords.accuracy === null
      || (typeof value.coords.accuracy === 'number' && Number.isFinite(value.coords.accuracy)));
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
