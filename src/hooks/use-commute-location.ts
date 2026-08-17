import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { TrackingProfile } from '@/domain/commute';

export type CommuteLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  updatedAt: number;
};

export type LocationRuntimeStatus = 'off' | 'requesting' | 'live' | 'denied' | 'unavailable';

export function useCommuteLocation() {
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const [location, setLocation] = useState<CommuteLocation | null>(null);
  const [runtimeStatus, setRuntimeStatus] = useState<LocationRuntimeStatus>('off');

  const stop = useCallback(() => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    setLocation(null);
    setRuntimeStatus('off');
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(async (profile: TrackingProfile) => {
    stop();
    setRuntimeStatus('requesting');

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setRuntimeStatus('denied');
        return { ok: false as const, reason: 'denied' as const };
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
        setRuntimeStatus('unavailable');
        return { ok: false as const, reason: 'unavailable' as const };
      }

      const accuracy = profile.label === 'Precise' ? Location.Accuracy.High : profile.label === 'Balanced' ? Location.Accuracy.Balanced : Location.Accuracy.Low;
      const current = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy }),
        20_000,
      );
      setLocation({
        latitude: current.coords.latitude,
        longitude: current.coords.longitude,
        accuracy: current.coords.accuracy,
        updatedAt: current.timestamp,
      });

      subscriptionRef.current = await Location.watchPositionAsync(
        { accuracy, distanceInterval: profile.distanceInterval, timeInterval: profile.timeInterval },
        (next) => {
          setLocation({
            latitude: next.coords.latitude,
            longitude: next.coords.longitude,
            accuracy: next.coords.accuracy,
            updatedAt: next.timestamp,
          });
        },
        () => {
          subscriptionRef.current?.remove();
          subscriptionRef.current = null;
          setRuntimeStatus('unavailable');
        },
      );
      setRuntimeStatus('live');
      return { ok: true as const };
    } catch {
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
      setLocation(null);
      setRuntimeStatus('unavailable');
      return { ok: false as const, reason: 'unavailable' as const };
    }
  }, [stop]);

  return { location, runtimeStatus, start, stop };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Location request timed out')), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}
