import type { RouteCoordinate, RouteGeometry } from './commute';

const maximumRouteCoordinates = 2_000;

type OsrmRouteResponse = {
  code?: unknown;
  routes?: unknown;
};

export function parseRoadRouteResponse(value: unknown): RouteGeometry {
  if (!isRecord(value)) throw new Error('Routing response was not an object');
  const response = value as OsrmRouteResponse;
  if (response.code !== 'Ok' || !Array.isArray(response.routes) || response.routes.length === 0) {
    throw new Error('No road route was returned');
  }

  const firstRoute = response.routes[0];
  if (!isRecord(firstRoute) || !isRecord(firstRoute.geometry) || firstRoute.geometry.type !== 'LineString') {
    throw new Error('Road route geometry was missing');
  }
  if (!Array.isArray(firstRoute.geometry.coordinates)) throw new Error('Road route coordinates were missing');

  const rawCoordinates = firstRoute.geometry.coordinates;
  if (rawCoordinates.length < 2 || rawCoordinates.length > maximumRouteCoordinates) {
    throw new Error('Road route coordinate count was invalid');
  }
  const coordinates = rawCoordinates.map(parseLngLat);
  const distanceMeters = firstRoute.distance;
  if (typeof distanceMeters !== 'number' || !Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    throw new Error('Road route distance was invalid');
  }

  return { source: 'road', coordinates, distanceMeters };
}

export function assertValidRouteCoordinate(
  value: { latitude: unknown; longitude: unknown },
): asserts value is RouteCoordinate {
  if (typeof value.latitude !== 'number'
    || !Number.isFinite(value.latitude)
    || value.latitude < -90
    || value.latitude > 90
    || typeof value.longitude !== 'number'
    || !Number.isFinite(value.longitude)
    || value.longitude < -180
    || value.longitude > 180) {
    throw new Error('Coordinate was outside valid latitude/longitude bounds');
  }
}

function parseLngLat(value: unknown): RouteCoordinate {
  if (!Array.isArray(value) || value.length < 2) throw new Error('Road route coordinate was invalid');
  const [longitude, latitude] = value;
  const coordinate = { latitude, longitude };
  assertValidRouteCoordinate(coordinate);
  return coordinate;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
