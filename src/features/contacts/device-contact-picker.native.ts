import {
  Contact,
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-contacts';

import type { DeviceContactResult } from './contact-import';

export async function pickDeviceContact(): Promise<DeviceContactResult> {
  try {
    const currentPermission = await getPermissionsAsync();
    const permission = currentPermission.granted
      ? currentPermission
      : await requestPermissionsAsync();

    if (!permission.granted) return { kind: 'denied' };

    const contact = await Contact.presentPicker();
    if (!contact) return { kind: 'cancelled' };

    const [fullName, phones] = await Promise.all([
      contact.getFullName(),
      contact.getPhones(),
    ]);
    const name = fullName.trim().slice(0, 80) || 'Selected contact';
    const phone = phones
      .map((item) => item.number?.trim())
      .find((number): number is string => Boolean(number))
      ?.slice(0, 30);

    return phone
      ? { kind: 'selected', name, phone }
      : { kind: 'no-phone', name };
  } catch {
    return { kind: 'error' };
  }
}
