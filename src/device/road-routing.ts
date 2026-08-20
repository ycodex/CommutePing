import type { RouteGeometry, RoutePoint } from '@/domain/commute';
import { assertValidRouteCoordinate, parseRoadRouteResponse } from '@/domain/road-routing';
import { getRoutingBaseUrl } from './open-map-config';

const requestTimeoutMs = 12_000;

export async function fetchRoadRoute(
  origin: Pick<RoutePoint, 'latitude' | 'longitude'>,
  destination: Pick<RoutePoint, 'latitude' | 'longitude'>,
): Promise<RouteGeometry> {
  assertValidRouteCoordinate(origin);
  assertValidRouteCoordinate(destination);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const coordinates = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const endpoint = `${getRoutingBaseUrl()}/route/v1/driving/${coordinates}?alternatives=false&steps=false&overview=full&geometries=geojson`;

  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Routing failed with status ${response.status}`);
    return parseRoadRouteResponse(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}
