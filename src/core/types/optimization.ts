import type { ConstraintSet } from './planner-settings';

export type AutopilotGoal =
  | 'confidence_first'
  | 'deadline_first'
  | 'fast_survey'
  | 'deep_mastery'
  | 'custom';

export type AutopilotDeadlinePolicy = 'none' | 'soft' | 'strict';
export type AutopilotConfidencePosture =
  | 'conservative'
  | 'balanced'
  | 'aggressive';
export type AutopilotSettingsPolicy = 'respect_current' | 'fresh_optimal';
export type AutopilotProofStatus =
  | 'optimal'
  | 'window_optimal'
  | 'feasible_with_gap'
  | 'infeasible';

export interface AutopilotWizardState {
  goal: AutopilotGoal;
  settingsPolicy: AutopilotSettingsPolicy;
  deadlinePolicy: AutopilotDeadlinePolicy;
  targetEndDate: string;
  latenessToleranceDays: number;
  confidencePosture: AutopilotConfidencePosture;
  scaryBookText: string;
  scaryBookIds: string[];
  avoidEarlyBookText: string;
  avoidEarlyBookIds: string[];
  hardParallelCap: number;
  dailyHours: number;
  floorPolicy: ConstraintSet['feasibilityMode'];
}

export interface PlannerOptimizationInput {
  createdAt: string;
  activeBookCount: number;
  relationCount: number;
  horizonDays: number;
  wizard: AutopilotWizardState;
  hardConstraints: string[];
  softObjectiveOrder: string[];
}

export interface PlannerOptimizationObjectiveBreakdown {
  infeasibility: number;
  deadlineLatenessDays: number;
  prerequisiteImpurity: number;
  overload: number;
  uncertaintyExposure: number;
  contextSwitching: number;
  pacingRoughness: number;
  tieBreak: number;
}

export interface PlannerOptimizationPlan {
  id: string;
  label: string;
  summary: string;
  constraintPatch: Partial<ConstraintSet>;
  objectiveBreakdown: PlannerOptimizationObjectiveBreakdown;
  finishDate: string | null;
  spanWeeks: number;
  peakBooks: number;
  totalHours: number;
}

export interface PlannerOptimizationResult {
  status: 'ready' | 'infeasible';
  backend: 'browser_exact' | 'heuristic_fallback' | 'ortools_unavailable';
  proofStatus: AutopilotProofStatus;
  proofScope: string;
  recommendedPlan: PlannerOptimizationPlan;
  paretoAlternatives: PlannerOptimizationPlan[];
  objectiveBreakdown: PlannerOptimizationObjectiveBreakdown;
  bindingConstraints: string[];
  relaxationSuggestions: string[];
}
