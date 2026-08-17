import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import type { CommutePreferences } from '@/domain/commute';
import { decodeCommutePreferences, encodeCommutePreferences } from '@/storage/commute-preferences';

const storageKey = 'commute-ping.preferences.v1';

export function useCommutePreferences(
  preferences: CommutePreferences,
  onHydrate: (preferences: CommutePreferences) => void,
) {
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    let mounted = true;

    AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (!mounted) return;
        const stored = decodeCommutePreferences(raw);
        if (stored) onHydrate(stored);
      })
      .catch(() => {
        if (mounted) setStorageError(true);
      })
      .finally(() => {
        if (mounted) setReady(true);
      });

    return () => {
      mounted = false;
    };
  }, [onHydrate]);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(storageKey, encodeCommutePreferences(preferences))
      .then(() => setStorageError(false))
      .catch(() => setStorageError(true));
  }, [preferences, ready]);

  return { ready, storageError };
}
