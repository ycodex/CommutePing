type BatteryListenerApi = {
  addBatteryLevelListener?: unknown;
  addLowPowerModeListener?: unknown;
};

export function canSubscribeToBatteryEvents(platform: string, api: BatteryListenerApi): boolean {
  return platform !== 'web'
    && typeof api.addBatteryLevelListener === 'function'
    && typeof api.addLowPowerModeListener === 'function';
}
