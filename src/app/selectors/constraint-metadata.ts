import type { ConstraintField, ConstraintSet } from '../../core/types';

export type ConstraintFieldView = ConstraintField & {
  advanced: boolean;
  summary: string;
  detail: string;
  optionDetails: Record<string, string>;
};

const ADVANCED_KEYS = new Set<keyof ConstraintSet>([
  'emptyDayPolicy',
  'backfillMode',
  'prereqMode',
  'relativePacingCurve',
  'pt',
  'boostStrength',
  'applyOverlapSkim',
  'skimRatio',
  'prereqRetention',
  'propLiftCap',
  'propMix',
  'propBreadth',
  'propNovelty',
  'damp',
  'alphaCap',
  'absFloor',
  'blendMode',
  'compressMode',
  'compressCurve',
  'compressExp',
  'diffMapMin',
  'diffMapMax',
  'diffCurveFloorPoint',
  'diffCurveCeilingPoint',
  'diffRamp',
  'subjectWorkloadStrength',
  'gam',
]);

const DETAILS: Partial<Record<keyof ConstraintSet, string>> = {
  diffMapMode: 'Choose whether displayed difficulty stays close to the raw engine score or stretches the current library across a clearer visual range.',
  diffMapMin: 'The lower bound used when scaled display mapping is active. Raise it if easy books look too easy in the UI.',
  diffMapMax: 'The upper bound used when scaled display mapping is active. Lower it if hard books visually dominate the plan.',
  diffCurveFloorPoint: 'Controls where the mapping curve leaves the low end. Higher values keep more low-percentile books near the display minimum.',
  diffCurveCeilingPoint: 'Controls where the mapping curve reaches the high end. Lower values make hard books hit the display maximum earlier.',
  diffRamp: 'Controls the steepness of the displayed curve. Higher values make high-difficulty books separate more sharply.',
  compressMode: 'Controls whether the displayed curve compresses or expands the score spread before the final range is applied.',
  compressCurve: 'Choose the visual shape used by compression. Inverse curves flip emphasis from late separation to early separation.',
  compressExp: 'The exponent used by compression. Values below 1 lift lower scores; values above 1 push more separation toward the hard end.',
  blendMode: 'Controls how base difficulty and graph-propagated difficulty are combined before display mapping.',
  alphaCap: 'Caps graph-driven lift relative to the base score so relation propagation cannot dominate the model.',
  absFloor: 'Allows a minimum amount of graph lift before the relative cap clamps it.',
  damp: 'Reduces graph propagation strength. Higher damping makes prerequisites affect difficulty less.',
  gam: 'Shapes how schedule difficulty changes reading time per page. This is a workload/time setting, not a display compression setting.',
  propMix: 'Controls how strongly prerequisite and graph signals can alter schedule difficulty.',
  emptyDayPolicy: 'Controls whether eligible work is pulled forward immediately or whether target release gaps are preserved and explained.',
  subjectWorkloadStrength: 'Controls how strongly inferred workload clusters can adjust schedule and display difficulty. Higher values make sparse technical books rely more on similar books and corpus evidence.',
  tl: 'Sets the soft end of the planning window. This does not force completion on that day; the solved plan still reports its real projected finish.',
};

const OPTION_DETAILS: Partial<Record<keyof ConstraintSet, Record<string, string>>> = {
  dailyBookMode: {
    interspersed: 'The scheduler may rotate between eligible books across days to keep the plan flexible.',
    daily_cohort: 'The same N books are kept active together until they finish, matching a stable daily stack.',
  },
  emptyDayPolicy: {
    fill_when_possible: 'The allocator starts any eligible feasible work as soon as possible while keeping prerequisites, manual starts, page floors, and time budget hard.',
    preserve_schedule_gaps: 'The allocator may wait for planned release windows, but blank calendar cells are labeled with the reason.',
  },
  bookOrderPolicy: {
    auto: 'The solver chooses order from prerequisites, difficulty, strategy, and feasibility.',
    prefer: 'Your library order and Owned status bias tie-breaks, but prerequisites and feasibility can still override it.',
    enforce: 'Your library order becomes an N-wide sequence based on parallel slots while still preserving real prerequisites.',
  },
  feasibilityMode: {
    strict_floor: 'Minimum pages per day is enforced. If a book cannot satisfy it within time, the plan reports a blocker.',
    practical: 'Minimum pages per day becomes a recommendation so the solver can still produce a complete plan.',
  },
  backfillMode: {
    global: 'Empty slots may use any eligible book, which tends to produce a more usable plan.',
    lane_preserving: 'Visual lane order is preserved more strictly, which can leave more empty slots.',
    branch_local: 'Backfill stays near the blocked branch, balancing flexibility with topic continuity.',
  },
  prereqMode: {
    strict: 'Prerequisites must finish before dependent books start unless a manual override exists.',
    smart_overlap: 'Dependents may start only when unmet prerequisites are already near completion.',
    soft: 'Prerequisites become ordering preferences instead of hard blockers.',
  },
  schedAlgo: {
    balanced: 'Balances difficulty, duration, and graph depth.',
    critical: 'Prioritizes long dependency chains so downstream books unlock sooner.',
    greedy: 'Prioritizes harder ready books earlier.',
    fastest: 'Searches available scheduler strategies and keeps the shortest valid finish.',
  },
  relativePacingCurve: {
    smoothstep: 'Smoothly spreads books without extreme jumps at either end.',
    linear: 'Maps relative difficulty directly into the page range.',
    sqrt: 'Gives easier and mid-range books more separation.',
    power: 'Emphasizes separation among the hardest books.',
  },
  blendMode: {
    geometric: 'Damps extreme propagation and keeps the final score conservative.',
    linear: 'Applies propagated graph lift more directly.',
  },
  compressMode: {
    auto: 'Applies compression when scaled display mapping is active.',
    off: 'Shows the curve without compression.',
    manual: 'Always applies the compression exponent to the displayed curve.',
  },
  compressCurve: {
    power: 'Direct exponent curve. This is predictable and keeps the previous behavior.',
    inverse_power: 'Front-loaded power curve. It separates lower and middle scores earlier.',
    smoothstep: 'Gentle S-curve. It separates the middle while avoiding harsh jumps at the ends.',
    inverse_smoothstep: 'Inverse smooth S-curve. It makes the middle easier to separate after normal S-curve compression.',
    tanh: 'Stronger S-curve. It compresses easy and hard extremes while emphasizing the middle.',
    inverse_tanh: 'Inverse tanh S-curve. It opens up the compressed extremes of the tanh shape.',
    sine: 'Sine ease. A smooth, intuitive curve with gentler ends than power.',
    inverse_sine: 'Inverse sine ease. It opens the sine curve in the opposite direction for earlier separation.',
    logistic: 'Logistic S-curve. It strongly emphasizes the middle while keeping extremes compact.',
    inverse_logistic: 'Inverse logistic S-curve. It expands the compressed logistic extremes.',
    linear: 'No curve shaping. Use this when you want the mapped distribution to stay simple.',
  },
  diffMapMode: {
    raw: 'Display scores stay close to the engine score on the 1-10 scale.',
    scaled: 'The current library is stretched into the selected display range.',
  },
  mutualOversize: {
    batch: 'Large co-study groups are split into batches that fit the parallel setting.',
    strict: 'Large co-study groups must stay together even if they exceed the normal parallel target.',
  },
};

export function constraintFieldView(field: ConstraintField): ConstraintFieldView {
  return {
    ...field,
    advanced: field.advanced ?? ADVANCED_KEYS.has(field.key),
    summary: field.summary ?? field.description,
    detail: field.detail ?? DETAILS[field.key] ?? field.description,
    optionDetails: field.optionDetails ?? OPTION_DETAILS[field.key] ?? {},
  };
}
