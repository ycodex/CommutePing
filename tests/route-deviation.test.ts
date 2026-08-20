import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canMonitorRouteDeviation,
  distanceToPolylineMeters,
  evaluateRouteDeviation,
  initialRouteDeviationState,
  routeCoordinatesFor,
} from '../src/domain/route-deviation.ts';

const roadPath = [
  { latitude: 12.97, longitude: 77.59 },
  { latitude: 12.97, longitude: 77.60 },
  { latitude: 12.975, longitude: 77.605 },
];

test('measures the shortest distance to the route polyline', () => {
  assert.ok(distanceToPolylineMeters({ latitude: 12.97, longitude: 77.595 }, roadPath) < 1);
  const distance = distanceToPolylineMeters({ latitude: 12.972, longitude: 77.595 }, roadPath);
  assert.ok(distance > 210 && distance < 235);
});

test('requires repeated accurate samples before declaring a deviation', () => {
  const offRouteSample = { latitude: 12.972, longitude: 77.595, accuracy: 10, observedAt: 1_000 };
  const first = evaluateRouteDeviation(initialRouteDeviationState, offRouteSample, roadPath);
  assert.equal(first.status, 'checking');
  assert.equal(first.consecutiveOutside, 1);

  const second = evaluateRouteDeviation(first, { ...offRouteSample, observedAt: 2_000 }, roadPath);
  assert.equal(second.status, 'checking');

  const third = evaluateRouteDeviation(second, { ...offRouteSample, observedAt: 3_000 }, roadPath);
  assert.equal(third.status, 'deviated');
  assert.equal(third.consecutiveOutside, 3);
});

test('ignores low-quality GPS samples and requires recovery confirmation', () => {
  const ignored = evaluateRouteDeviation(
    initialRouteDeviationState,
    { latitude: 12.972, longitude: 77.595, accuracy: 150, observedAt: 1_000 },
    roadPath,
  );
  assert.equal(ignored.status, 'on-route');
  assert.equal(ignored.sampleQuality, 'poor-accuracy');
  assert.equal(ignored.consecutiveOutside, 0);

  let deviated = initialRouteDeviationState;
  for (let index = 1; index <= 3; index += 1) {
    deviated = evaluateRouteDeviation(
      deviated,
      { latitude: 12.972, longitude: 77.595, accuracy: 10, observedAt: index * 1_000 },
      roadPath,
    );
  }
  const firstRecovery = evaluateRouteDeviation(
    deviated,
    { latitude: 12.97, longitude: 77.595, accuracy: 10, observedAt: 4_000 },
    roadPath,
  );
  assert.equal(firstRecovery.status, 'deviated');

  const recovered = evaluateRouteDeviation(
    firstRecovery,
    { latitude: 12.97, longitude: 77.596, accuracy: 10, observedAt: 5_000 },
    roadPath,
  );
  assert.equal(recovered.status, 'on-route');
});

test('only road-following geometry enables deviation monitoring', () => {
  const baseRoute = {
    id: 'route-1',
    title: 'Office to Home',
    schedule: 'Weekdays',
    durationMinutes: 30,
    learned: false,
    origin: { label: 'Office', ...roadPath[0] },
    destination: { label: 'Home', ...roadPath[2] },
  };
  const previewRoute = { ...baseRoute, geometry: { source: 'preview' as const, coordinates: [roadPath[0], roadPath[2]] } };
  const monitoredRoute = { ...baseRoute, geometry: { source: 'road' as const, coordinates: roadPath } };

  assert.equal(canMonitorRouteDeviation(previewRoute), false);
  assert.equal(canMonitorRouteDeviation(monitoredRoute), true);
  assert.deepEqual(routeCoordinatesFor(previewRoute), [roadPath[0], roadPath[2]]);
});
