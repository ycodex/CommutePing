import assert from 'node:assert/strict';
import test from 'node:test';

import { canSubscribeToBatteryEvents } from '../src/device/battery-capabilities.ts';
import { decodeCommutePreferences, encodeCommutePreferences } from '../src/storage/commute-preferences.ts';

const preferences = {
  rules: { connectivity: true, battery: false, idle: true, calls: false },
  sensors: { snatch: true, fall: false },
  contacts: [{ id: 'contact-1', name: 'Meera', relation: 'Roommate', phone: '+91 90000 00003', status: 'local' as const }],
  routes: [{
    id: 'route-1',
    title: 'Office to Home',
    schedule: 'Weekdays · 8:30 PM',
    durationMinutes: 42,
    learned: false,
    origin: { label: 'MG Road, Bengaluru', latitude: 12.9756, longitude: 77.6063 },
    destination: { label: 'Indiranagar, Bengaluru', latitude: 12.9784, longitude: 77.6408 },
  }],
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
  assert.equal(decodeCommutePreferences(JSON.stringify({
    version: 1,
    preferences: {
      ...preferences,
      routes: [{ ...preferences.routes[0], origin: { label: 'Invalid', latitude: 190, longitude: 77 } }],
    },
  })), null);
});

test('keeps routes saved by older builds without map points', () => {
  const legacyPreferences = {
    ...preferences,
    routes: [{ id: 'legacy-route', title: 'College to Home', schedule: 'Weekdays · 5:00 PM', durationMinutes: 35, learned: false }],
  };
  assert.deepEqual(decodeCommutePreferences(encodeCommutePreferences(legacyPreferences)), legacyPreferences);
});
