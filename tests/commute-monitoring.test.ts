import assert from 'node:assert/strict';
import test from 'node:test';

import {
  commuteTimingAt,
  evaluateIdlePosition,
  initialIdleMonitorState,
} from '../src/domain/commute-monitoring.ts';
import {
  evaluateMotionSafety,
  initialMotionSafetyState,
} from '../src/domain/motion-safety.ts';

test('calculates expected arrival and late state from the selected route duration', () => {
  const startedAt = Date.UTC(2026, 7, 18, 12, 0);
  assert.deepEqual(commuteTimingAt(startedAt, 30, startedAt + 15 * 60_000), {
    expectedArrivalAt: startedAt + 30 * 60_000,
    remainingMinutes: 15,
    status: 'on-time',
  });
  assert.equal(commuteTimingAt(startedAt, 30, startedAt + 25 * 60_000).status, 'due-soon');
  assert.equal(commuteTimingAt(startedAt, 30, startedAt + 41 * 60_000).status, 'late');
});

test('requires sustained stationary accurate positions before marking a commute idle', () => {
  const origin = { latitude: 12.9716, longitude: 77.5946, accuracy: 12, observedAt: 0 };
  const anchored = evaluateIdlePosition(initialIdleMonitorState, origin);
  assert.equal(anchored.status, 'moving');

  const stationary = evaluateIdlePosition(anchored, { ...origin, longitude: 77.5947, observedAt: 4 * 60_000 });
  assert.equal(stationary.status, 'stationary');

  const idle = evaluateIdlePosition(stationary, { ...origin, longitude: 77.59465, observedAt: 8 * 60_000 });
  assert.equal(idle.status, 'idle');
});

test('movement resets the stationary timer and poor accuracy is ignored', () => {
  const origin = { latitude: 12.9716, longitude: 77.5946, accuracy: 10, observedAt: 0 };
  const anchored = evaluateIdlePosition(initialIdleMonitorState, origin);
  const ignored = evaluateIdlePosition(anchored, { ...origin, accuracy: 140, observedAt: 9 * 60_000 });
  assert.equal(ignored, anchored);

  const moved = evaluateIdlePosition(anchored, { ...origin, longitude: 77.596, observedAt: 4 * 60_000 });
  assert.equal(moved.status, 'moving');
  assert.equal(moved.stationarySince, 4 * 60_000);
});

test('detects a fall candidate only after free-fall followed by impact and rotation', () => {
  const freeFall = evaluateMotionSafety(initialMotionSafetyState, {
    accelerationG: 0.25,
    rotationRadians: 0.4,
    observedAt: 1_000,
  });
  assert.equal(freeFall.candidate, null);

  const impact = evaluateMotionSafety(freeFall.state, {
    accelerationG: 3.1,
    rotationRadians: 1.8,
    observedAt: 2_100,
  });
  assert.equal(impact.candidate, 'fall');
});

test('requires two consecutive combined acceleration and rotation spikes for snatch candidate', () => {
  const first = evaluateMotionSafety(initialMotionSafetyState, {
    accelerationG: 3.2,
    rotationRadians: 3.2,
    observedAt: 1_000,
  });
  assert.equal(first.candidate, null);

  const second = evaluateMotionSafety(first.state, {
    accelerationG: 3.4,
    rotationRadians: 3.5,
    observedAt: 1_500,
  });
  assert.equal(second.candidate, 'snatch');

  const cooldown = evaluateMotionSafety(second.state, {
    accelerationG: 3.6,
    rotationRadians: 3.6,
    observedAt: 3_000,
  });
  assert.equal(cooldown.candidate, null);
});
