export const RELATION_REASON_THRESHOLDS = {
  coverage: 0.28,
  novelty: 0.42,
  complexity: 0.4,
  progression: 0.46,
} as const;

export const RELATION_DIRECTION_MODEL = {
  complexityOffset: 1.2,
  complexityDivisor: 4,
  seedOffset: 1.2,
  seedDivisor: 4.5,
  pageOffset: 0.3,
} as const;

export const PROGRESSION_MODEL = {
  introWeight: 0.34,
  advancedWeight: 0.24,
  bridgeWeight: 0.24,
  advancedDeltaWeight: 0.1,
  introDeltaWeight: 0.08,
} as const;
