import type { DeviceContactResult } from './contact-import';

export async function pickDeviceContact(): Promise<DeviceContactResult> {
  return { kind: 'unavailable' };
}
