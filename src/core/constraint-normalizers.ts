import { AUTO_RD_MIN_CHAIN_FLOOR } from './constants';
import type {
  BackfillMode,
  BookOrderPolicy,
  CompressCurve,
  DailyBookMode,
  EmptyDayPolicy,
  FeasibilityMode,
  PlanColorMode,
  PrerequisiteMode,
  RelativePacingCurve,
  ScheduleAlgorithm,
} from './types';

export function normalizeSchedAlgo(
  value: string | undefined,
): ScheduleAlgorithm {
  if (value === 'category' || value === 'balanced') return 'balanced';
  if (value === 'critical') return 'critical';
  if (value === 'greedy') return 'greedy';
  if (value === 'fastest') return 'fastest';
  return 'balanced';
}

export function normalizeFeasibilityMode(
  value: string | undefined,
): FeasibilityMode {
  return value === 'practical' ? 'practical' : 'strict_floor';
}

export function normalizePlanColorMode(
  value: string | undefined,
): PlanColorMode {
  if (
    value === 'detected_genre' ||
    value === 'difficulty_gradient' ||
    value === 'reading_time_gradient'
  )
    return value;
  return 'category_mono';
}

export function normalizeRelativePacingCurve(
  value: string | undefined,
): RelativePacingCurve {
  if (value === 'linear' || value === 'sqrt' || value === 'power') return value;
  return 'smoothstep';
}

export function normalizeCompressCurve(
  value: string | undefined,
): CompressCurve {
  if (
    value === 'linear' ||
    value === 'power' ||
    value === 'inverse_power' ||
    value === 'smoothstep' ||
    value === 'inverse_smoothstep' ||
    value === 'tanh' ||
    value === 'inverse_tanh' ||
    value === 'sine' ||
    value === 'inverse_sine' ||
    value === 'logistic' ||
    value === 'inverse_logistic'
  )
    return value;
  if (value === 'sqrt') return 'inverse_power';
  return 'power';
}

export function normalizeDailyBookMode(
  value: string | undefined,
): DailyBookMode {
  return value === 'daily_cohort' ? 'daily_cohort' : 'interspersed';
}

export function normalizeEmptyDayPolicy(
  value: string | undefined,
): EmptyDayPolicy {
  return value === 'preserve_schedule_gaps'
    ? 'preserve_schedule_gaps'
    : 'fill_when_possible';
}

export function normalizeBookOrderPolicy(
  value: string | undefined,
): BookOrderPolicy {
  if (value === 'prefer' || value === 'enforce') return value;
  return 'auto';
}

export function normalizeBackfillMode(value: string | undefined): BackfillMode {
  return value === 'lane_preserving' || value === 'branch_local'
    ? value
    : 'global';
}

export function normalizePrereqMode(
  value: string | undefined,
): PrerequisiteMode {
  return value === 'smart_overlap' || value === 'soft' ? value : 'strict';
}

export function normalizeAutoResearchChainLength(value: number): number {
  return Math.max(
    AUTO_RD_MIN_CHAIN_FLOOR,
    Math.trunc(value || AUTO_RD_MIN_CHAIN_FLOOR),
  );
}
