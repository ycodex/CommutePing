import type { RouteCoordinate } from './commute';

export type CommuteTiming = {
  expectedArrivalAt: number;
  remainingMinutes: number;
  status: 'on-time' | 'due-soon' | 'late';
};

export type IdlePositionSample = RouteCoordinate & {
  accuracy: number | null;
  observedAt: number;
};

export type IdleMonitorState = {
  anchor: RouteCoordinate | null;
  stationarySince: number | null;
  status: 'moving' | 'stationary' | 'idle';
  distanceFromAnchorMeters: number | null;
};

export type IdleMonitorConfig = {
  movementThresholdMeters: number;
  idleAfterMs: number;
  maximumAccuracyMeters: number;
};

export const defaultIdleMonitorConfig: IdleMonitorConfig = {
  movementThresholdMeters: 50,
  idleAfterMs: 8 * 60_000,
  maximumAccuracyMeters: 80,
};

export const initialIdleMonitorState: IdleMonitorState = {
  anchor: null,
  stationarySince: null,
  status: 'moving',
  distanceFromAnchorMeters: null,
};

export function commuteTimingAt(
  startedAt: number,
  durationMinutes: number,
  now: number,
  lateGraceMinutes = 10,
): CommuteTiming {
  const expectedArrivalAt = startedAt + durationMinutes * 60_000;
  const remainingMinutes = Math.ceil((expectedArrivalAt - now) / 60_000);
  const lateAt = expectedArrivalAt + lateGraceMinutes * 60_000;
  return {
    expectedArrivalAt,
    remainingMinutes,
    status: now > lateAt ? 'late' : remainingMinutes <= 10 ? 'due-soon' : 'on-time',
  };
}

export function evaluateIdlePosition(
  state: IdleMonitorState,
  sample: IdlePositionSample,
  config: IdleMonitorConfig = defaultIdleMonitorConfig,
): IdleMonitorState {
  if (sample.accuracy !== null && sample.accuracy > config.maximumAccuracyMeters) return state;
  const coordinate = { latitude: sample.latitude, longitude: sample.longitude };
  if (!state.anchor || state.stationarySince === null) {
    return {
      anchor: coordinate,
      stationarySince: sample.observedAt,
      status: 'moving',
      distanceFromAnchorMeters: 0,
    };
  }

  const distanceFromAnchorMeters = distanceMeters(coordinate, state.anchor);
  if (distanceFromAnchorMeters >= config.movementThresholdMeters) {
    return {
      anchor: coordinate,
      stationarySince: sample.observedAt,
      status: 'moving',
      distanceFromAnchorMeters,
    };
  }

  return {
    ...state,
    status: sample.observedAt - state.stationarySince >= config.idleAfterMs ? 'idle' : 'stationary',
    distanceFromAnchorMeters,
  };
}

function distanceMeters(first: RouteCoordinate, second: RouteCoordinate): number {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = degreesToRadians(second.latitude - first.latitude);
  const longitudeDelta = degreesToRadians(second.longitude - first.longitude);
  const firstLatitude = degreesToRadians(first.latitude);
  const secondLatitude = degreesToRadians(second.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function degreesToRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}
