export type DeviceContactResult =
  | { kind: 'selected'; name: string; phone: string }
  | { kind: 'no-phone'; name: string }
  | { kind: 'denied' }
  | { kind: 'cancelled' }
  | { kind: 'unavailable' }
  | { kind: 'error' };

export type ContactPrefill = { name: string; phone: string } | null;

export function contactSetupForResult(result: DeviceContactResult): { prefill: ContactPrefill; message: string } {
  switch (result.kind) {
    case 'selected':
      return {
        prefill: { name: result.name, phone: result.phone },
        message: 'Selected from phone contacts. Review the details before saving locally.',
      };
    case 'no-phone':
      return {
        prefill: { name: result.name, phone: '' },
        message: 'That contact has no phone number. Add one manually before saving.',
      };
    case 'denied':
      return {
        prefill: null,
        message: 'Contact access was not allowed. You can still enter the details manually.',
      };
    case 'cancelled':
      return {
        prefill: null,
        message: 'No phone contact was selected. You can enter the details manually.',
      };
    case 'unavailable':
      return {
        prefill: null,
        message: 'Phone contact access is available in the Android and iOS app. Enter details manually here.',
      };
    case 'error':
      return {
        prefill: null,
        message: 'Phone contacts could not be opened. Enter the details manually or try again later.',
      };
  }
}
