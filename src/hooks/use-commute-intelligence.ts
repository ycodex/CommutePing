import { useCallback, useEffect, useReducer, useState } from 'react';

import {
  evaluateIdlePosition,
  initialIdleMonitorState,
  type IdleMonitorState,
  type IdlePositionSample,
} from '@/domain/commute-monitoring';
import type { SensorKey } from '@/domain/commute';
import {
  evaluateMotionSafety,
  initialMotionSafetyState,
  type MotionSafetySample,
  type MotionSafetyState,
} from '@/domain/motion-safety';
import type { CommuteLocation } from './use-commute-location';
import type { MotionReading } from './use-device-safety';

type IdleAction = { type: 'RESET' } | { type: 'OBSERVE'; sample: IdlePositionSample };

function idleReducer(state: IdleMonitorState, action: IdleAction): IdleMonitorState {
  return action.type === 'RESET' ? initialIdleMonitorState : evaluateIdlePosition(state, action.sample);
}

export function useIdleMonitor(enabled: boolean, location: CommuteLocation | null): IdleMonitorState {
  const [state, dispatch] = useReducer(idleReducer, initialIdleMonitorState);
  useEffect(() => {
    if (!enabled || !location) {
      dispatch({ type: 'RESET' });
      return;
    }
    dispatch({
      type: 'OBSERVE',
      sample: {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        observedAt: location.updatedAt,
      },
    });
  }, [enabled, location]);
  return state;
}

export type MotionSafetyCandidate = {
  kind: SensorKey;
  detectedAt: number;
  accelerationG: number;
  rotationRadians: number;
};

type MotionCandidateState = {
  detector: MotionSafetyState;
  candidate: MotionSafetyCandidate | null;
};

type MotionCandidateAction =
  | { type: 'RESET' }
  | { type: 'CLEAR_CANDIDATE' }
  | { type: 'OBSERVE'; sample: MotionSafetySample; sensors: Record<SensorKey, boolean> };

const initialMotionCandidateState: MotionCandidateState = {
  detector: initialMotionSafetyState,
  candidate: null,
};

function motionCandidateReducer(state: MotionCandidateState, action: MotionCandidateAction): MotionCandidateState {
  if (action.type === 'RESET') return initialMotionCandidateState;
  if (action.type === 'CLEAR_CANDIDATE') return { ...state, candidate: null };
  if (state.candidate) return state;

  const result = evaluateMotionSafety(state.detector, action.sample);
  const candidate = result.candidate && action.sensors[result.candidate]
    ? {
        kind: result.candidate,
        detectedAt: action.sample.observedAt,
        accelerationG: action.sample.accelerationG,
        rotationRadians: action.sample.rotationRadians,
      }
    : null;
  return { detector: result.state, candidate };
}

export function useMotionSafetyCandidate(
  enabled: boolean,
  reading: MotionReading,
  sensors: Record<SensorKey, boolean>,
) {
  const [state, dispatch] = useReducer(motionCandidateReducer, initialMotionCandidateState);
  useEffect(() => {
    if (!enabled || !reading.available) {
      dispatch({ type: 'RESET' });
      return;
    }
    dispatch({
      type: 'OBSERVE',
      sample: {
        accelerationG: reading.acceleration,
        rotationRadians: reading.rotation,
        observedAt: Date.now(),
      },
      sensors,
    });
  }, [enabled, reading, sensors]);

  const clearCandidate = useCallback(() => dispatch({ type: 'CLEAR_CANDIDATE' }), []);
  return { candidate: state.candidate, clearCandidate };
}

export function useCommuteClock(enabled: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return;
    const update = () => setNow(Date.now());
    const initialUpdate = setTimeout(update, 0);
    const timer = setInterval(update, 30_000);
    return () => {
      clearTimeout(initialUpdate);
      clearInterval(timer);
    };
  }, [enabled]);
  return now;
}
