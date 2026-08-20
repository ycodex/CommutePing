import { useEffect, useMemo, useReducer } from 'react';

import type { RouteCoordinate, SavedRoute } from '@/domain/commute';
import {
  canMonitorRouteDeviation,
  evaluateRouteDeviation,
  initialRouteDeviationState,
  routeCoordinatesFor,
  type RouteDeviationState,
  type RoutePositionSample,
} from '@/domain/route-deviation';
import type { CommuteLocation } from './use-commute-location';

type DeviationAction =
  | { type: 'RESET' }
  | { type: 'OBSERVE'; routeId: string; route: RouteCoordinate[]; sample: RoutePositionSample };

type TrackedDeviation = {
  routeId: string | null;
  value: RouteDeviationState;
};

const initialTrackedDeviation: TrackedDeviation = {
  routeId: null,
  value: initialRouteDeviationState,
};

function deviationReducer(current: TrackedDeviation, action: DeviationAction): TrackedDeviation {
  if (action.type === 'RESET') return initialTrackedDeviation;
  const value = evaluateRouteDeviation(
    current.routeId === action.routeId ? current.value : initialRouteDeviationState,
    action.sample,
    action.route,
  );
  return { routeId: action.routeId, value };
}

export function useRouteDeviation(
  enabled: boolean,
  route: SavedRoute | null,
  location: CommuteLocation | null,
) {
  const [trackedDeviation, dispatch] = useReducer(deviationReducer, initialTrackedDeviation);
  const routeCoordinates = useMemo(() => routeCoordinatesFor(route), [route]);
  const monitoringAvailable = canMonitorRouteDeviation(route);

  useEffect(() => {
    if (!enabled || !monitoringAvailable || !location || !route) {
      dispatch({ type: 'RESET' });
      return;
    }
    dispatch({
      type: 'OBSERVE',
      routeId: route.id,
      route: routeCoordinates,
      sample: {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        observedAt: location.updatedAt,
      },
    });
  }, [enabled, location, monitoringAvailable, route, routeCoordinates]);

  return { deviation: trackedDeviation.value, monitoringAvailable, routeCoordinates };
}
