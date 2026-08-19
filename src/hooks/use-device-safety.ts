import * as Battery from 'expo-battery';
import { Accelerometer, Gyroscope } from 'expo-sensors';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { canSubscribeToBatteryEvents } from '@/device/battery-capabilities';

export type MotionReading = {
  acceleration: number;
  rotation: number;
  available: boolean;
};

const inactiveMotionReading: MotionReading = {
  acceleration: 0,
  rotation: 0,
  available: false,
};

export function useBatteryState() {
  const [batteryPercent, setBatteryPercent] = useState<number | null>(null);
  const [lowPowerMode, setLowPowerMode] = useState(false);

  useEffect(() => {
    let mounted = true;

    Battery.getPowerStateAsync()
      .then((powerState) => {
        if (!mounted) return;
        if (powerState.batteryLevel >= 0) setBatteryPercent(Math.round(powerState.batteryLevel * 100));
        setLowPowerMode(powerState.lowPowerMode);
      })
      .catch(() => {
        // Keep the privacy-safe demo value when the simulator cannot expose battery state.
      });

    if (!canSubscribeToBatteryEvents(Platform.OS, Battery)) {
      return () => {
        mounted = false;
      };
    }

    const levelSubscription = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      if (batteryLevel >= 0) setBatteryPercent(Math.round(batteryLevel * 100));
    });
    const powerSubscription = Battery.addLowPowerModeListener(({ lowPowerMode: isLowPower }) => {
      setLowPowerMode(isLowPower);
    });

    return () => {
      mounted = false;
      levelSubscription.remove();
      powerSubscription.remove();
    };
  }, []);

  return { batteryPercent, lowPowerMode };
}

export function useMotionReadings(enabled: boolean): MotionReading {
  const [reading, setReading] = useState<MotionReading>(inactiveMotionReading);

  useEffect(() => {
    if (!enabled) return;

    let mounted = true;
    let accelerationSubscription: { remove: () => void } | null = null;
    let rotationSubscription: { remove: () => void } | null = null;

    Promise.all([Accelerometer.isAvailableAsync(), Gyroscope.isAvailableAsync()])
      .then(([accelerometerAvailable, gyroscopeAvailable]) => {
        if (!mounted || !accelerometerAvailable || !gyroscopeAvailable) return;

        Accelerometer.setUpdateInterval(450);
        Gyroscope.setUpdateInterval(450);
        accelerationSubscription = Accelerometer.addListener(({ x, y, z }) => {
          const magnitude = Math.sqrt(x * x + y * y + z * z);
          setReading((current) => ({ ...current, acceleration: magnitude, available: true }));
        });
        rotationSubscription = Gyroscope.addListener(({ x, y, z }) => {
          const magnitude = Math.sqrt(x * x + y * y + z * z);
          setReading((current) => ({ ...current, rotation: magnitude, available: true }));
        });
      })
      .catch(() => {
        if (mounted) setReading(inactiveMotionReading);
      });

    return () => {
      mounted = false;
      accelerationSubscription?.remove();
      rotationSubscription?.remove();
    };
  }, [enabled]);

  return enabled ? reading : inactiveMotionReading;
}
