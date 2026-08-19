import type { SensorKey } from './commute';

export type MotionSafetySample = {
  accelerationG: number;
  rotationRadians: number;
  observedAt: number;
};

export type MotionSafetyState = {
  freeFallAt: number | null;
  snatchSpikeCount: number;
  lastCandidateAt: number | null;
};

export type MotionSafetyResult = {
  state: MotionSafetyState;
  candidate: SensorKey | null;
};

export type MotionSafetyConfig = {
  freeFallMaximumG: number;
  impactMinimumG: number;
  fallRotationMinimum: number;
  fallWindowMs: number;
  snatchAccelerationMinimumG: number;
  snatchRotationMinimum: number;
  snatchRequiredSamples: number;
  cooldownMs: number;
};

export const defaultMotionSafetyConfig: MotionSafetyConfig = {
  freeFallMaximumG: 0.45,
  impactMinimumG: 2.6,
  fallRotationMinimum: 1.2,
  fallWindowMs: 2_500,
  snatchAccelerationMinimumG: 2.8,
  snatchRotationMinimum: 2.8,
  snatchRequiredSamples: 2,
  cooldownMs: 60_000,
};

export const initialMotionSafetyState: MotionSafetyState = {
  freeFallAt: null,
  snatchSpikeCount: 0,
  lastCandidateAt: null,
};

export function evaluateMotionSafety(
  state: MotionSafetyState,
  sample: MotionSafetySample,
  config: MotionSafetyConfig = defaultMotionSafetyConfig,
): MotionSafetyResult {
  if (state.lastCandidateAt !== null && sample.observedAt - state.lastCandidateAt < config.cooldownMs) {
    return {
      state: { ...state, freeFallAt: null, snatchSpikeCount: 0 },
      candidate: null,
    };
  }

  const freeFallAt = sample.accelerationG <= config.freeFallMaximumG
    ? sample.observedAt
    : state.freeFallAt !== null && sample.observedAt - state.freeFallAt <= config.fallWindowMs
      ? state.freeFallAt
      : null;
  const fallCandidate = freeFallAt !== null
    && sample.observedAt > freeFallAt
    && sample.observedAt - freeFallAt <= config.fallWindowMs
    && sample.accelerationG >= config.impactMinimumG
    && sample.rotationRadians >= config.fallRotationMinimum;
  if (fallCandidate) {
    return {
      state: { freeFallAt: null, snatchSpikeCount: 0, lastCandidateAt: sample.observedAt },
      candidate: 'fall',
    };
  }

  const combinedSnatchSpike = sample.accelerationG >= config.snatchAccelerationMinimumG
    && sample.rotationRadians >= config.snatchRotationMinimum;
  const snatchSpikeCount = combinedSnatchSpike ? state.snatchSpikeCount + 1 : 0;
  if (snatchSpikeCount >= config.snatchRequiredSamples) {
    return {
      state: { freeFallAt: null, snatchSpikeCount: 0, lastCandidateAt: sample.observedAt },
      candidate: 'snatch',
    };
  }

  return {
    state: { ...state, freeFallAt, snatchSpikeCount },
    candidate: null,
  };
}
