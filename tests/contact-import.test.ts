import assert from 'node:assert/strict';
import test from 'node:test';

import { contactSetupForResult } from '../src/features/contacts/contact-import.ts';

test('prefills only the contact selected by the user', () => {
  assert.deepEqual(
    contactSetupForResult({ kind: 'selected', name: 'Meera', phone: '+91 98765 43210' }).prefill,
    { name: 'Meera', phone: '+91 98765 43210' },
  );
});

test('keeps manual contact entry available without permission', () => {
  const denied = contactSetupForResult({ kind: 'denied' });
  assert.equal(denied.prefill, null);
  assert.match(denied.message, /manually/i);
});

test('prefills a selected name when the phone number is missing', () => {
  assert.deepEqual(
    contactSetupForResult({ kind: 'no-phone', name: 'Asha' }).prefill,
    { name: 'Asha', phone: '' },
  );
});
