import assert from 'node:assert/strict';
import test from 'node:test';

import { assertValidRouteCoordinate, parseRoadRouteResponse } from '../src/domain/road-routing.ts';

test('parses a bounded OSRM road route into app coordinates', () => {
  const geometry = parseRoadRouteResponse({
    code: 'Ok',
    routes: [{
      distance: 4_321.5,
      geometry: {
        type: 'LineString',
        coordinates: [
          [77.6063, 12.9756],
          [77.6408, 12.9784],
        ],
      },
    }],
  });

  assert.deepEqual(geometry, {
    source: 'road',
    distanceMeters: 4_321.5,
    coordinates: [
      { latitude: 12.9756, longitude: 77.6063 },
      { latitude: 12.9784, longitude: 77.6408 },
    ],
  });
});

test('rejects malformed or out-of-range routing data', () => {
  assert.throws(() => parseRoadRouteResponse({ code: 'NoRoute', routes: [] }));
  assert.throws(() => parseRoadRouteResponse({
    code: 'Ok',
    routes: [{
      distance: 100,
      geometry: { type: 'LineString', coordinates: [[77, 12], [181, 12]] },
    }],
  }));
  assert.throws(() => assertValidRouteCoordinate({ latitude: Number.NaN, longitude: 77 }));
});

test('rejects unexpectedly large routing responses', () => {
  const coordinates = Array.from({ length: 2_001 }, (_, index) => [77 + index / 100_000, 12]);
  assert.throws(() => parseRoadRouteResponse({
    code: 'Ok',
    routes: [{ distance: 100, geometry: { type: 'LineString', coordinates } }],
  }));
});
