import assert from 'node:assert/strict';
import test from 'node:test';

import {
  commuteReducer,
  initialCommuteState,
  trackingProfileForBattery,
} from '../src/domain/commute.ts';

test('selects a battery-aware tracking profile', () => {
  assert.deepEqual(trackingProfileForBattery(82, false), {
    label: 'Precise',
    distanceInterval: 15,
    timeInterval: 10_000,
  });
  assert.equal(trackingProfileForBattery(38, false).label, 'Balanced');
  assert.equal(trackingProfileForBattery(18, false).label, 'Battery saver');
  assert.equal(trackingProfileForBattery(88, true).label, 'Battery saver');
});

test('moves through the explicit commute lifecycle', () => {
  const requesting = commuteReducer(initialCommuteState, { type: 'START_REQUESTED' });
  assert.equal(requesting.phase, 'starting');
  assert.equal(requesting.locationStatus, 'requesting');

  const active = commuteReducer(requesting, { type: 'START_SUCCEEDED' });
  assert.equal(active.phase, 'active');
  assert.equal(active.locationStatus, 'live');

  const checkedIn = commuteReducer(active, { type: 'CHECK_IN', timestamp: 1000 });
  assert.equal(checkedIn.lastCheckInAt, 1000);

  const ended = commuteReducer(checkedIn, { type: 'END_COMMUTE', timestamp: 2000 });
  assert.equal(ended.phase, 'idle');
  assert.equal(ended.locationStatus, 'off');
  assert.equal(ended.lastCheckInAt, 2000);
});

test('fails safely when location permission is denied', () => {
  const requesting = commuteReducer(initialCommuteState, { type: 'START_REQUESTED' });
  const denied = commuteReducer(requesting, { type: 'START_FAILED', status: 'denied' });
  assert.equal(denied.phase, 'idle');
  assert.equal(denied.locationStatus, 'denied');
});

test('keeps the commute active but marks live location unavailable when updates fail', () => {
  const active = commuteReducer(initialCommuteState, { type: 'START_SUCCEEDED' });
  const unavailable = commuteReducer(active, { type: 'LOCATION_LOST' });
  assert.equal(unavailable.phase, 'active');
  assert.equal(unavailable.locationStatus, 'unavailable');
});

test('ignores check-ins when a commute is not active', () => {
  const next = commuteReducer(initialCommuteState, { type: 'CHECK_IN', timestamp: 1000 });
  assert.equal(next, initialCommuteState);
});

test('saves a user-entered route once', () => {
  const route = { id: 'route-1', title: 'Office to Home', schedule: 'Weekdays · 8:30 PM', durationMinutes: 42, learned: false };
  const saved = commuteReducer(initialCommuteState, { type: 'ADD_ROUTE', route });
  const savedAgain = commuteReducer(saved, { type: 'ADD_ROUTE', route: { ...route, id: 'route-2' } });
  assert.equal(saved.routes[0]?.title, 'Office to Home');
  assert.equal(savedAgain.routes.length, saved.routes.length);
});

test('deduplicates trusted contacts by phone number', () => {
  const added = commuteReducer(initialCommuteState, {
    type: 'ADD_CONTACT',
    contact: { id: 'meera', name: 'Meera', relation: 'Roommate', phone: '+91 90000 00003', status: 'local' },
  });
  assert.equal(added.contacts.length, initialCommuteState.contacts.length + 1);
  assert.equal(added.contacts.at(-1)?.status, 'local');

  const duplicate = commuteReducer(added, {
    type: 'ADD_CONTACT',
    contact: { id: 'duplicate', name: 'Meera duplicate', relation: 'Roommate', phone: '919000000003', status: 'local' },
  });
  assert.equal(duplicate.contacts.length, added.contacts.length);
});

test('toggles alert rules and sensors independently', () => {
  const callsEnabled = commuteReducer(initialCommuteState, { type: 'TOGGLE_RULE', key: 'calls' });
  assert.equal(callsEnabled.rules.calls, true);
  assert.equal(callsEnabled.rules.idle, false);

  const fallDisabled = commuteReducer(initialCommuteState, { type: 'TOGGLE_SENSOR', key: 'fall' });
  assert.equal(fallDisabled.sensors.fall, false);
  assert.equal(fallDisabled.sensors.snatch, true);
});

test('clears only locally persisted preferences', () => {
  const populated = commuteReducer(initialCommuteState, {
    type: 'ADD_CONTACT',
    contact: { id: 'meera', name: 'Meera', relation: 'Roommate', phone: '+91 90000 00003', status: 'local' },
  });
  const active = commuteReducer(populated, { type: 'START_SUCCEEDED' });
  const cleared = commuteReducer(active, { type: 'RESET_PREFERENCES' });
  assert.equal(cleared.contacts.length, 0);
  assert.equal(cleared.routes.length, 0);
  assert.equal(cleared.phase, 'active');
});
