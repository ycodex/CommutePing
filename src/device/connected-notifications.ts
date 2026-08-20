export type PushRegistrationResult =
  | { ok: true; token: string; platform: 'android' | 'ios' }
  | { ok: false; reason: 'unsupported' | 'denied' | 'unavailable' };

export async function registerConnectedNotifications(): Promise<PushRegistrationResult> {
  return { ok: false, reason: 'unsupported' };
}

export function subscribeToConnectedNotifications(_listener: () => void): () => void {
  return () => {};
}
