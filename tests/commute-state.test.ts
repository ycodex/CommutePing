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
  const route = {
    id: 'route-1',
    title: 'Office to Home',
    schedule: 'Weekdays · 8:30 PM',
    durationMinutes: 42,
    learned: false,
  };
  const withRoute = commuteReducer(initialCommuteState, { type: 'ADD_ROUTE', route });
  const requesting = commuteReducer(withRoute, { type: 'START_REQUESTED', routeId: route.id });
  assert.equal(requesting.phase, 'starting');
  assert.equal(requesting.locationStatus, 'requesting');

  const active = commuteReducer(requesting, { type: 'START_SUCCEEDED', timestamp: 500 });
  assert.equal(active.phase, 'active');
  assert.equal(active.locationStatus, 'live');
  assert.equal(active.startedAt, 500);

  const checkedIn = commuteReducer(active, { type: 'CHECK_IN', timestamp: 1000 });
  assert.equal(checkedIn.lastCheckInAt, 1000);

  const ended = commuteReducer(checkedIn, { type: 'END_COMMUTE', timestamp: 2000 });
  assert.equal(ended.phase, 'idle');
  assert.equal(ended.locationStatus, 'off');
  assert.equal(ended.lastCheckInAt, 2000);
  assert.equal(ended.startedAt, null);
});

test('fails safely when location permission is denied', () => {
  const route = {
    id: 'route-1',
    title: 'Office to Home',
    schedule: 'Weekdays · 8:30 PM',
    durationMinutes: 42,
    learned: false,
  };
  const withRoute = commuteReducer(initialCommuteState, { type: 'ADD_ROUTE', route });
  const requesting = commuteReducer(withRoute, { type: 'START_REQUESTED', routeId: route.id });
  const denied = commuteReducer(requesting, { type: 'START_FAILED', status: 'denied' });
  assert.equal(denied.phase, 'idle');
  assert.equal(denied.locationStatus, 'denied');
});

test('keeps the selected route for the active commute and clears it when the commute ends', () => {
  const route = {
    id: 'route-1',
    title: 'Office to Home',
    schedule: 'Weekdays · 8:30 PM',
    durationMinutes: 42,
    learned: false,
    origin: { label: 'MG Road, Bengaluru', latitude: 12.9756, longitude: 77.6063 },
    destination: { label: 'Indiranagar, Bengaluru', latitude: 12.9784, longitude: 77.6408 },
  };
  const saved = commuteReducer(initialCommuteState, { type: 'ADD_ROUTE', route });
  const requesting = commuteReducer(saved, { type: 'START_REQUESTED', routeId: route.id });
  assert.equal(requesting.activeRouteId, route.id);

  const active = commuteReducer(requesting, { type: 'START_SUCCEEDED' });
  assert.equal(active.activeRouteId, route.id);

  const ended = commuteReducer(active, { type: 'END_COMMUTE', timestamp: 2_000 });
  assert.equal(ended.activeRouteId, null);
});

test('requires a saved route before requesting commute tracking', () => {
  const withoutRoute = commuteReducer(initialCommuteState, { type: 'START_REQUESTED' });
  assert.equal(withoutRoute.phase, 'idle');
  assert.equal(withoutRoute.locationStatus, 'off');

  const requesting = commuteReducer(initialCommuteState, { type: 'START_REQUESTED', routeId: 'missing' });
  assert.equal(requesting.phase, 'idle');
  assert.equal(requesting.activeRouteId, null);
});

test('records and resolves a bounded local safety incident', () => {
  const incident = {
    id: 'incident-1',
    kind: 'idle' as const,
    title: 'Prolonged idle',
    detail: 'No meaningful movement for 8 minutes.',
    createdAt: 1_000,
    status: 'open' as const,
  };
  const recorded = commuteReducer(initialCommuteState, { type: 'RECORD_INCIDENT', incident });
  assert.deepEqual(recorded.incidents, [incident]);

  const resolved = commuteReducer(recorded, { type: 'RESOLVE_INCIDENT', id: incident.id, status: 'dismissed' });
  assert.equal(resolved.incidents[0]?.status, 'dismissed');
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
  const route = {
    id: 'route-1',
    title: 'Office to Home',
    schedule: 'Weekdays · 8:30 PM',
    durationMinutes: 42,
    learned: false,
    origin: { label: 'MG Road, Bengaluru', latitude: 12.9756, longitude: 77.6063 },
    destination: { label: 'Indiranagar, Bengaluru', latitude: 12.9784, longitude: 77.6408 },
  };
  const saved = commuteReducer(initialCommuteState, { type: 'ADD_ROUTE', route });
  const savedAgain = commuteReducer(saved, { type: 'ADD_ROUTE', route: { ...route, id: 'route-2' } });
  assert.equal(saved.routes[0]?.title, 'Office to Home');
  assert.equal(saved.routes[0]?.destination?.label, 'Indiranagar, Bengaluru');
  assert.equal(savedAgain.routes.length, saved.routes.length);
});

test('upgrades a saved route with validated road geometry', () => {
  const route = {
    id: 'route-1',
    title: 'Office to Home',
    schedule: 'Weekdays',
    durationMinutes: 42,
    learned: false,
  };
  const geometry = {
    source: 'road' as const,
    coordinates: [
      { latitude: 12.9756, longitude: 77.6063 },
      { latitude: 12.9784, longitude: 77.6408 },
    ],
    distanceMeters: 4_200,
  };
  const saved = commuteReducer(initialCommuteState, { type: 'ADD_ROUTE', route });
  const upgraded = commuteReducer(saved, { type: 'UPDATE_ROUTE_GEOMETRY', id: route.id, geometry });

  assert.deepEqual(upgraded.routes[0]?.geometry, geometry);
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

test('removes only the selected trusted contact', () => {
  const first = { id: 'meera', name: 'Meera', relation: 'Roommate', phone: '+91 90000 00003', status: 'local' as const };
  const second = { id: 'anu', name: 'Anu', relation: 'Sister', phone: '+91 90000 00004', status: 'local' as const };
  const withFirst = commuteReducer(initialCommuteState, { type: 'ADD_CONTACT', contact: first });
  const withBoth = commuteReducer(withFirst, { type: 'ADD_CONTACT', contact: second });

  const removed = commuteReducer(withBoth, { type: 'DELETE_CONTACT', id: first.id });
  assert.deepEqual(removed.contacts, [second]);
});

test('removes a saved route only when it is not active', () => {
  const route = { id: 'route-1', title: 'Office to Home', schedule: 'Weekdays', durationMinutes: 42, learned: false };
  const saved = commuteReducer(initialCommuteState, { type: 'ADD_ROUTE', route });
  const removed = commuteReducer(saved, { type: 'DELETE_ROUTE', id: route.id });
  assert.deepEqual(removed.routes, []);

  const requesting = commuteReducer(saved, { type: 'START_REQUESTED', routeId: route.id });
  const active = commuteReducer(requesting, { type: 'START_SUCCEEDED', timestamp: 1_000 });
  const protectedRoute = commuteReducer(active, { type: 'DELETE_ROUTE', id: route.id });
  assert.deepEqual(protectedRoute.routes, [route]);
});

test('toggles alert rules and sensors independently', () => {
  const callsEnabled = commuteReducer(initialCommuteState, { type: 'TOGGLE_RULE', key: 'calls' });
  assert.equal(callsEnabled.rules.calls, true);
  assert.equal(callsEnabled.rules.idle, false);

  const fallDisabled = commuteReducer(initialCommuteState, { type: 'TOGGLE_SENSOR', key: 'fall' });
  assert.equal(fallDisabled.sensors.fall, false);
  assert.equal(fallDisabled.sensors.snatch, true);
});

test('clears incident history without deleting contacts, routes, or preferences', () => {
  const contact = { id: 'meera', name: 'Meera', relation: 'Roommate', phone: '+91 90000 00003', status: 'local' as const };
  const route = { id: 'route-1', title: 'Office to Home', schedule: 'Weekdays', durationMinutes: 42, learned: false };
  const withContact = commuteReducer(initialCommuteState, {
    type: 'ADD_CONTACT',
    contact,
  });
  const withRoute = commuteReducer(withContact, { type: 'ADD_ROUTE', route });
  const withRule = commuteReducer(withRoute, { type: 'TOGGLE_RULE', key: 'idle' });
  const withIncident = commuteReducer(withRule, {
    type: 'RECORD_INCIDENT',
    incident: { id: 'incident-1', kind: 'sos', title: 'SOS opened', detail: 'Local SOS.', createdAt: 1_000, status: 'open' },
  });

  const cleared = commuteReducer(withIncident, { type: 'CLEAR_INCIDENTS' });
  assert.deepEqual(cleared.incidents, []);
  assert.deepEqual(cleared.contacts, [contact]);
  assert.deepEqual(cleared.routes, [route]);
  assert.equal(cleared.rules.idle, true);
});
