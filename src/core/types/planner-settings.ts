export type GanttView = 'plan' | 'diagnostics';
export type PlanColorMode =
  | 'category_mono'
  | 'detected_genre'
  | 'difficulty_gradient'
  | 'reading_time_gradient';
export type FeasibilityMode = 'practical' | 'strict_floor';
export type RelativePacingCurve = 'linear' | 'smoothstep' | 'sqrt' | 'power';
export type DailyBookMode = 'interspersed' | 'daily_cohort';
export type EmptyDayPolicy = 'fill_when_possible' | 'preserve_schedule_gaps';
export type BookOrderPolicy = 'auto' | 'prefer' | 'enforce';
export type BackfillMode = 'global' | 'lane_preserving' | 'branch_local';
export type PrerequisiteMode = 'strict' | 'smart_overlap' | 'soft';
export type ScheduleAlgorithm = 'balanced' | 'critical' | 'greedy' | 'fastest';
export type DiffMode = 'difficulty' | 'neutral';
export type BlendMode = 'geometric' | 'linear';
export type CompressMode = 'auto' | 'off' | 'manual';
export type CompressCurve =
  | 'power'
  | 'inverse_power'
  | 'smoothstep'
  | 'inverse_smoothstep'
  | 'tanh'
  | 'inverse_tanh'
  | 'sine'
  | 'inverse_sine'
  | 'logistic'
  | 'inverse_logistic'
  | 'linear';
export type DiffMapMode = 'raw' | 'scaled';
export type WarningSeverity = 'info' | 'warn' | 'fail';

export interface ConstraintSet {
  damp: number;
  gam: number;
  mode: DiffMode;
  tl: number;
  par: number;
  hpd: number;
  dpw: number;
  pt: number;
  bmp: number;
  sd: string;
  minPg: number;
  maxPg: number;
  relativePacingStrength: number;
  relativePacingCurve: RelativePacingCurve;
  subjectWorkloadStrength: number;
  dailyBookMode: DailyBookMode;
  emptyDayPolicy: EmptyDayPolicy;
  bookOrderPolicy: BookOrderPolicy;
  schedAlgo: ScheduleAlgorithm;
  feasibilityMode: FeasibilityMode;
  backfillMode: BackfillMode;
  prereqMode: PrerequisiteMode;
  skimRatio: number;
  prereqRetention: number;
  propLiftCap: number;
  propMix: number;
  propBreadth: number;
  propNovelty: number;
  blendMode: BlendMode;
  alphaCap: number;
  absFloor: number;
  compressMode: CompressMode;
  compressCurve: CompressCurve;
  compressExp: number;
  diffMapMode: DiffMapMode;
  diffMapMin: number;
  diffMapMax: number;
  diffCurveFloorPoint: number;
  diffCurveCeilingPoint: number;
  diffRamp: number;
  applyOverlapSkim: boolean;
  boostUnused: boolean;
  boostStrength: number;
  mutualEnabled: boolean;
  mutualOversize: 'batch' | 'strict';
  autoRD: boolean;
  rdMinChain: number;
  rdMinSlope: number;
  tr: boolean;
  part: boolean;
  excComp: boolean;
  displayGroups: Record<string, number>;
  studyWeekdays: number[];
  weekdaysCustom: boolean;
}
