export type BackgroundTrackingResult = 'ready' | 'denied' | 'unavailable';

export async function prepareBackgroundCommuteTracking(): Promise<BackgroundTrackingResult> {
  return 'unavailable';
}

export async function setActiveBackgroundCommute(_commuteId: string): Promise<void> {}

export async function stopBackgroundCommuteTracking(): Promise<void> {}
