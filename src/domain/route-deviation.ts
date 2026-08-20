import type { RouteCoordinate, SavedRoute } from './commute';

export type RouteDeviationStatus = 'on-route' | 'checking' | 'deviated';
export type RouteSampleQuality = 'waiting' | 'accepted' | 'poor-accuracy';

export type RouteDeviationState = {
  status: RouteDeviationStatus;
  sampleQuality: RouteSampleQuality;
  consecutiveOutside: number;
  consecutiveInside: number;
  distanceFromRouteMeters: number | null;
  lastObservedAt: number | null;
};

export type RoutePositionSample = RouteCoordinate & {
  accuracy: number | null;
  observedAt: number;
};

export type RouteDeviationConfig = {
  deviationThresholdMeters: number;
  recoveryThresholdMeters: number;
  requiredOutsideSamples: number;
  requiredRecoverySamples: number;
  maximumAccuracyMeters: number;
};

export const defaultRouteDeviationConfig: RouteDeviationConfig = {
  deviationThresholdMeters: 120,
  recoveryThresholdMeters: 70,
  requiredOutsideSamples: 3,
  requiredRecoverySamples: 2,
  maximumAccuracyMeters: 80,
};

export const initialRouteDeviationState: RouteDeviationState = {
  status: 'on-route',
  sampleQuality: 'waiting',
  consecutiveOutside: 0,
  consecutiveInside: 0,
  distanceFromRouteMeters: null,
  lastObservedAt: null,
};

export function routeCoordinatesFor(route: SavedRoute | null): RouteCoordinate[] {
  if (!route) return [];
  if (route.geometry?.coordinates && route.geometry.coordinates.length >= 2) {
    return route.geometry.coordinates;
  }
  if (!route.origin || !route.destination) return [];
  return [route.origin, route.destination];
}

export function canMonitorRouteDeviation(route: SavedRoute | null): boolean {
  return route?.geometry?.source === 'road' && route.geometry.coordinates.length >= 2;
}

export function evaluateRouteDeviation(
  state: RouteDeviationState,
  sample: RoutePositionSample,
  route: RouteCoordinate[],
  config: RouteDeviationConfig = defaultRouteDeviationConfig,
): RouteDeviationState {
  if (route.length < 2) return initialRouteDeviationState;
  if (sample.accuracy !== null && sample.accuracy > config.maximumAccuracyMeters) {
    return {
      ...state,
      sampleQuality: 'poor-accuracy',
      lastObservedAt: sample.observedAt,
    };
  }

  const distanceFromRouteMeters = distanceToPolylineMeters(sample, route);
  const acceptedAccuracy = sample.accuracy ?? 0;
  const deviationThreshold = Math.max(config.deviationThresholdMeters, acceptedAccuracy * 2);
  const recoveryThreshold = Math.max(config.recoveryThresholdMeters, acceptedAccuracy * 1.5);

  if (state.status === 'deviated') {
    const consecutiveInside = distanceFromRouteMeters <= recoveryThreshold ? state.consecutiveInside + 1 : 0;
    if (consecutiveInside >= config.requiredRecoverySamples) {
      return {
        status: 'on-route',
        sampleQuality: 'accepted',
        consecutiveOutside: 0,
        consecutiveInside: 0,
        distanceFromRouteMeters,
        lastObservedAt: sample.observedAt,
      };
    }
    return {
      ...state,
      sampleQuality: 'accepted',
      consecutiveInside,
      distanceFromRouteMeters,
      lastObservedAt: sample.observedAt,
    };
  }

  if (distanceFromRouteMeters > deviationThreshold) {
    const consecutiveOutside = state.consecutiveOutside + 1;
    return {
      status: consecutiveOutside >= config.requiredOutsideSamples ? 'deviated' : 'checking',
      sampleQuality: 'accepted',
      consecutiveOutside,
      consecutiveInside: 0,
      distanceFromRouteMeters,
      lastObservedAt: sample.observedAt,
    };
  }

  return {
    status: 'on-route',
    sampleQuality: 'accepted',
    consecutiveOutside: 0,
    consecutiveInside: 0,
    distanceFromRouteMeters,
    lastObservedAt: sample.observedAt,
  };
}

export function distanceToPolylineMeters(point: RouteCoordinate, route: RouteCoordinate[]): number {
  if (route.length === 0) return Number.POSITIVE_INFINITY;
  if (route.length === 1) return planarDistanceMeters(point, route[0]);

  let closest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < route.length; index += 1) {
    closest = Math.min(closest, distanceToSegmentMeters(point, route[index - 1], route[index]));
  }
  return closest;
}

const earthRadiusMeters = 6_371_000;

function distanceToSegmentMeters(point: RouteCoordinate, start: RouteCoordinate, end: RouteCoordinate): number {
  const startMeters = relativeMeters(point, start);
  const endMeters = relativeMeters(point, end);
  const segmentX = endMeters.x - startMeters.x;
  const segmentY = endMeters.y - startMeters.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (segmentLengthSquared === 0) return Math.hypot(startMeters.x, startMeters.y);

  const projection = Math.max(0, Math.min(1, -(startMeters.x * segmentX + startMeters.y * segmentY) / segmentLengthSquared));
  return Math.hypot(startMeters.x + projection * segmentX, startMeters.y + projection * segmentY);
}

function planarDistanceMeters(point: RouteCoordinate, other: RouteCoordinate): number {
  const meters = relativeMeters(point, other);
  return Math.hypot(meters.x, meters.y);
}

function relativeMeters(origin: RouteCoordinate, target: RouteCoordinate): { x: number; y: number } {
  const latitudeRadians = degreesToRadians(origin.latitude);
  return {
    x: degreesToRadians(target.longitude - origin.longitude) * Math.cos(latitudeRadians) * earthRadiusMeters,
    y: degreesToRadians(target.latitude - origin.latitude) * earthRadiusMeters,
  };
}

function degreesToRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}
