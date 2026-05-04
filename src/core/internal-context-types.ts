import type {
  BackfillMode,
  Clock,
  EmptyDayPolicy,
  FeasibilityMode,
  Logger,
  PlannerProjectV1,
  PrerequisiteMode,
} from './types';

export interface PlannerServices {
  clock: Clock;
  logger: Logger;
}

export interface NormalizedPolicies {
  feasibilityMode: FeasibilityMode;
  emptyDayPolicy: EmptyDayPolicy;
  backfillMode: BackfillMode;
  prereqMode: PrerequisiteMode;
}

export interface ComputePlannerSnapshotContext {
  project: PlannerProjectV1;
  services: PlannerServices;
  policies: NormalizedPolicies;
}
