import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeInviteCode,
  normalizePhoneForInvite,
  parseCreatedInvite,
  parseMonitoredCommutes,
  parseTrustedConnections,
  routeSharePayload,
} from '../src/domain/connected-commutes.ts';
import type { SavedRoute } from '../src/domain/commute.ts';

const connectionId = 'a57e9fb0-82e4-4f01-a34b-6c517ebee62f';
const commuteId = 'dcc99bdd-74f4-49be-8b12-8f423951b5b5';
const inviteCode = '0123456789abcdef0123456789abcdef0123456789abcdef';

test('normalizes Indian mobile numbers and rejects malformed values', () => {
  assert.equal(normalizePhoneForInvite('98765 43210'), '+919876543210');
  assert.equal(normalizePhoneForInvite('+44 7700 900123'), '+447700900123');
  assert.equal(normalizePhoneForInvite('123'), null);
  assert.equal(normalizePhoneForInvite('+0123456789'), null);
});

test('accepts only fixed-length hexadecimal invitation codes', () => {
  assert.equal(normalizeInviteCode(inviteCode.toUpperCase()), inviteCode);
  assert.equal(normalizeInviteCode(`${inviteCode}00`), null);
  assert.equal(normalizeInviteCode('z'.repeat(48)), null);
});

test('shares only bounded, road-validated route geometry', () => {
  const route: SavedRoute = {
    id: 'route-1',
    title: 'Office',
    schedule: 'Weekdays',
    durationMinutes: 35,
    learned: false,
    origin: { label: 'Home', latitude: 12.9756, longitude: 77.6063 },
    destination: { label: 'Office', latitude: 12.9784, longitude: 77.6408 },
    geometry: {
      source: 'road',
      coordinates: [
        { latitude: 12.9756, longitude: 77.6063 },
        { latitude: 12.9784, longitude: 77.6408 },
      ],
    },
  };
  assert.deepEqual(routeSharePayload(route)?.coordinates, route.geometry?.coordinates);
  assert.equal(routeSharePayload({ ...route, geometry: { ...route.geometry!, source: 'preview' } }), null);
  assert.equal(routeSharePayload({ ...route, destination: undefined }), null);
});

test('parses trusted connections while dropping malformed rows', () => {
  const rows = parseTrustedConnections([
    {
      connection_id: connectionId,
      contact_name: 'Amma',
      relation: 'Parent',
      status: 'accepted',
      accepted_user_name: 'Lakshmi',
      invite_expires_at: '2026-08-21T10:00:00.000Z',
      accepted_at: '2026-08-20T10:00:00.000Z',
    },
    { connection_id: 'not-a-uuid' },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.id, connectionId);
  assert.equal(rows[0]?.status, 'accepted');
});

test('parses monitored commutes and rejects untrusted coordinate data', () => {
  const base = {
    commute_id: commuteId,
    traveller_name: 'Ananya',
    route_title: 'Office commute',
    commute_status: 'active',
    started_at: '2026-08-20T08:00:00.000Z',
    expected_arrival_at: '2026-08-20T09:00:00.000Z',
    completed_at: null,
    acknowledged_at: null,
    route_coordinates: [
      { latitude: 12.9756, longitude: 77.6063 },
      { latitude: 12.9784, longitude: 77.6408 },
    ],
    latitude: 12.976,
    longitude: 77.61,
    accuracy_meters: 18,
    last_observed_at: '2026-08-20T08:10:00.000Z',
    battery_percent: 71,
    movement_status: 'moving',
    route_status: 'on-route',
  };
  const parsed = parseMonitoredCommutes([base]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.currentLocation?.accuracy, 18);
  assert.deepEqual(parseMonitoredCommutes([{ ...base, route_coordinates: [{ latitude: 95, longitude: 77 }, { latitude: 12, longitude: 77 }] }]), []);
});

test('parses server-created invites only when UUID, token, and expiry are valid', () => {
  assert.deepEqual(parseCreatedInvite([{
    invite_id: connectionId,
    invite_code: inviteCode,
    expires_at: '2026-08-21T10:00:00.000Z',
  }]), {
    id: connectionId,
    code: inviteCode,
    expiresAt: Date.parse('2026-08-21T10:00:00.000Z'),
  });
  assert.equal(parseCreatedInvite([{ invite_id: connectionId, invite_code: 'bad', expires_at: 'tomorrow' }]), null);
});
