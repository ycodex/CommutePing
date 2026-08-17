import assert from 'node:assert/strict';
import test from 'node:test';

import { canSubscribeToBatteryEvents } from '../src/device/battery-capabilities.ts';
import { decodeCommutePreferences, encodeCommutePreferences } from '../src/storage/commute-preferences.ts';

const preferences = {
  rules: { connectivity: true, battery: false, idle: true, calls: false },
  sensors: { snatch: true, fall: false },
  contacts: [{ id: 'contact-1', name: 'Meera', relation: 'Roommate', phone: '+91 90000 00003', status: 'local' as const }],
  routes: [{ id: 'route-1', title: 'Office to Home', schedule: 'Weekdays · 8:30 PM', durationMinutes: 42, learned: false }],
};

test('never subscribes to unsupported battery listeners on web', () => {
  assert.equal(canSubscribeToBatteryEvents('web', {}), false);
  assert.equal(canSubscribeToBatteryEvents('web', { addBatteryLevelListener() {}, addLowPowerModeListener() {} }), false);
  assert.equal(canSubscribeToBatteryEvents('ios', {}), false);
  assert.equal(canSubscribeToBatteryEvents('android', { addBatteryLevelListener() {}, addLowPowerModeListener() {} }), true);
});

test('round-trips bounded local preferences', () => {
  assert.deepEqual(decodeCommutePreferences(encodeCommutePreferences(preferences)), preferences);
});

test('rejects malformed or unsupported stored preferences', () => {
  assert.equal(decodeCommutePreferences('{not json'), null);
  assert.equal(decodeCommutePreferences(JSON.stringify({ version: 2, preferences })), null);
  assert.equal(decodeCommutePreferences(JSON.stringify({ version: 1, preferences: { ...preferences, contacts: [{ phone: 'missing fields' }] } })), null);
});
