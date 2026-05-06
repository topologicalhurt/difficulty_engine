import {
  PLAN_ZOOM_MAX,
  PLAN_ZOOM_MIN,
  RELATIVE_PACING_MAX,
  RELATIVE_PACING_MIN,
  SUBJECT_WORKLOAD_MAX,
  SUBJECT_WORKLOAD_MIN,
} from './constants';
import {
  normalizeBackfillMode,
  normalizeBookOrderPolicy,
  normalizeCompressCurve,
  normalizeDailyBookMode,
  normalizeEmptyDayPolicy,
  normalizeFeasibilityMode,
  normalizePlanColorMode,
  normalizePrereqMode,
  normalizeRelativePacingCurve,
  normalizeSchedAlgo,
} from './constraint-normalizers';
import {
  DEFAULT_DISPLAY_GROUPS,
  DEFAULT_UI_STATE,
  createDefaultConstraints,
} from './defaults';
import type { ConstraintSet, PlannerProjectV1 } from './types';
import { weekdaysForCount } from './weekdays';
import {
  normalizeBoolean,
  normalizeDateKey,
  normalizeNumber,
  normalizeString,
  normalizeWeekdays,
} from './project-normalize-primitives';

function normalizeDisplayGroups(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_DISPLAY_GROUPS };
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .map(
      ([key, rawWeight]) =>
        [normalizeString(key), normalizeNumber(rawWeight, 1, 0, 100)] as const,
    )
    .filter(([key]) => Boolean(key));
  return entries.length
    ? Object.fromEntries(entries)
    : { ...DEFAULT_DISPLAY_GROUPS };
}

export function normalizeConstraints(value: unknown): ConstraintSet {
  const defaults = createDefaultConstraints();
  const raw =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const studyWeekdays = normalizeWeekdays(
    raw.studyWeekdays,
    defaults.studyWeekdays,
  );
  const weekdaysCustom =
    normalizeBoolean(raw.weekdaysCustom) && studyWeekdays.length > 0;
  const dpw = weekdaysCustom
    ? studyWeekdays.length
    : normalizeNumber(raw.dpw, defaults.dpw, 1, 7, true);
  const constraints: ConstraintSet = {
    damp: normalizeNumber(raw.damp, defaults.damp, 0, 1),
    gam: normalizeNumber(raw.gam, defaults.gam, 0.1, 10),
    mode: raw.mode === 'neutral' ? 'neutral' : defaults.mode,
    tl: normalizeNumber(raw.tl, defaults.tl, 1, 120),
    par: normalizeNumber(raw.par, defaults.par, 1, 12, true),
    hpd: normalizeNumber(raw.hpd, defaults.hpd, 0.25, 24),
    dpw,
    pt: normalizeNumber(raw.pt, defaults.pt, 0, 1),
    bmp: normalizeNumber(raw.bmp, defaults.bmp, 1, 240),
    sd: normalizeDateKey(raw.sd, defaults.sd),
    minPg: normalizeNumber(raw.minPg, defaults.minPg, 1, 500, true),
    maxPg: normalizeNumber(raw.maxPg, defaults.maxPg, 1, 500, true),
    relativePacingStrength: normalizeNumber(
      raw.relativePacingStrength,
      defaults.relativePacingStrength,
      RELATIVE_PACING_MIN,
      RELATIVE_PACING_MAX,
    ),
    relativePacingCurve: normalizeRelativePacingCurve(
      normalizeString(raw.relativePacingCurve) || defaults.relativePacingCurve,
    ),
    subjectWorkloadStrength: normalizeNumber(
      raw.subjectWorkloadStrength,
      defaults.subjectWorkloadStrength,
      SUBJECT_WORKLOAD_MIN,
      SUBJECT_WORKLOAD_MAX,
    ),
    dailyBookMode: normalizeDailyBookMode(
      normalizeString(raw.dailyBookMode) || defaults.dailyBookMode,
    ),
    emptyDayPolicy: normalizeEmptyDayPolicy(
      normalizeString(raw.emptyDayPolicy) || defaults.emptyDayPolicy,
    ),
    bookOrderPolicy: normalizeBookOrderPolicy(
      normalizeString(raw.bookOrderPolicy) || defaults.bookOrderPolicy,
    ),
    schedAlgo: normalizeSchedAlgo(
      normalizeString(raw.schedAlgo) || defaults.schedAlgo,
    ),
    feasibilityMode: normalizeFeasibilityMode(
      normalizeString(raw.feasibilityMode) || defaults.feasibilityMode,
    ),
    backfillMode: normalizeBackfillMode(
      normalizeString(raw.backfillMode) || defaults.backfillMode,
    ),
    prereqMode: normalizePrereqMode(
      normalizeString(raw.prereqMode) || defaults.prereqMode,
    ),
    skimRatio: normalizeNumber(raw.skimRatio, defaults.skimRatio, 0, 1),
    prereqRetention: normalizeNumber(
      raw.prereqRetention,
      defaults.prereqRetention,
      0,
      1,
    ),
    propLiftCap: normalizeNumber(raw.propLiftCap, defaults.propLiftCap, 0, 10),
    propMix: normalizeNumber(raw.propMix, defaults.propMix, 0, 1),
    propBreadth: normalizeNumber(raw.propBreadth, defaults.propBreadth, 0, 2),
    propNovelty: normalizeNumber(raw.propNovelty, defaults.propNovelty, 0, 2),
    blendMode: raw.blendMode === 'linear' ? 'linear' : defaults.blendMode,
    alphaCap: normalizeNumber(raw.alphaCap, defaults.alphaCap, 0, 1),
    absFloor: normalizeNumber(raw.absFloor, defaults.absFloor, 0, 1),
    compressMode:
      raw.compressMode === 'manual' || raw.compressMode === 'off'
        ? raw.compressMode
        : defaults.compressMode,
    compressCurve: normalizeCompressCurve(
      normalizeString(raw.compressCurve) || defaults.compressCurve,
    ),
    compressExp: normalizeNumber(raw.compressExp, defaults.compressExp, 0.1, 5),
    diffMapMode: raw.diffMapMode === 'scaled' ? 'scaled' : defaults.diffMapMode,
    diffMapMin: normalizeNumber(raw.diffMapMin, defaults.diffMapMin, 0.1, 10),
    diffMapMax: normalizeNumber(raw.diffMapMax, defaults.diffMapMax, 0.1, 10),
    diffCurveFloorPoint: normalizeNumber(
      raw.diffCurveFloorPoint,
      defaults.diffCurveFloorPoint,
      0,
      0.45,
    ),
    diffCurveCeilingPoint: normalizeNumber(
      raw.diffCurveCeilingPoint,
      defaults.diffCurveCeilingPoint,
      0.55,
      1,
    ),
    diffRamp: normalizeNumber(raw.diffRamp, defaults.diffRamp, 0.1, 5),
    applyOverlapSkim:
      raw.applyOverlapSkim == null
        ? defaults.applyOverlapSkim
        : normalizeBoolean(raw.applyOverlapSkim),
    boostUnused:
      raw.boostUnused == null
        ? defaults.boostUnused
        : normalizeBoolean(raw.boostUnused),
    boostStrength: normalizeNumber(
      raw.boostStrength,
      defaults.boostStrength,
      0,
      2,
    ),
    mutualEnabled:
      raw.mutualEnabled == null
        ? defaults.mutualEnabled
        : normalizeBoolean(raw.mutualEnabled),
    mutualOversize:
      raw.mutualOversize === 'strict' ? 'strict' : defaults.mutualOversize,
    autoRD: raw.autoRD == null ? defaults.autoRD : normalizeBoolean(raw.autoRD),
    rdMinChain: normalizeNumber(
      raw.rdMinChain,
      defaults.rdMinChain,
      1,
      100,
      true,
    ),
    rdMinSlope: normalizeNumber(raw.rdMinSlope, defaults.rdMinSlope, 0, 10),
    tr: raw.tr == null ? defaults.tr : normalizeBoolean(raw.tr),
    part: raw.part == null ? defaults.part : normalizeBoolean(raw.part),
    excComp:
      raw.excComp == null ? defaults.excComp : normalizeBoolean(raw.excComp),
    displayGroups: normalizeDisplayGroups(raw.displayGroups),
    studyWeekdays: weekdaysCustom ? studyWeekdays : weekdaysForCount(dpw),
    weekdaysCustom,
  };
  constraints.maxPg = Math.max(constraints.minPg, constraints.maxPg);
  constraints.diffMapMax = Math.max(
    constraints.diffMapMin,
    constraints.diffMapMax,
  );
  constraints.diffCurveCeilingPoint = Math.max(
    constraints.diffCurveCeilingPoint,
    constraints.diffCurveFloorPoint + 0.1,
  );
  return constraints;
}

export function normalizeUiPreferences(
  raw: Record<string, unknown>,
): PlannerProjectV1['uiPreferences'] {
  return {
    ganttView:
      raw.uiPreferences && typeof raw.uiPreferences === 'object'
        ? String((raw.uiPreferences as Record<string, unknown>).ganttView) ===
          'diagnostics'
          ? 'diagnostics'
          : DEFAULT_UI_STATE.ganttView
        : DEFAULT_UI_STATE.ganttView,
    ganttZoom:
      raw.uiPreferences && typeof raw.uiPreferences === 'object'
        ? normalizeNumber(
            (raw.uiPreferences as Record<string, unknown>).ganttZoom,
            DEFAULT_UI_STATE.ganttZoom,
            PLAN_ZOOM_MIN,
            PLAN_ZOOM_MAX,
          )
        : DEFAULT_UI_STATE.ganttZoom,
    planColorMode:
      raw.uiPreferences && typeof raw.uiPreferences === 'object'
        ? normalizePlanColorMode(
            normalizeString(
              (raw.uiPreferences as Record<string, unknown>).planColorMode,
            ),
          )
        : DEFAULT_UI_STATE.planColorMode,
  };
}
