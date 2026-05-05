import {
  GENERIC_DIFFICULTY_ADVANCED_SHIFT,
  GENERIC_DIFFICULTY_BASE,
  GENERIC_DIFFICULTY_INTRO_SHIFT,
  GENERIC_DIFFICULTY_LONG_BOOK_SHIFT,
  GENERIC_DIFFICULTY_LONG_BOOK_THRESHOLD,
  GENERIC_DIFFICULTY_MEDIUM_BOOK_SHIFT,
  GENERIC_DIFFICULTY_MEDIUM_BOOK_THRESHOLD,
  GENERIC_DIFFICULTY_PAGE_LOG_MAX,
  GENERIC_DIFFICULTY_PAGE_LOG_MIN,
  GENERIC_DIFFICULTY_PAGE_LOG_WEIGHT,
  GENERIC_DIFFICULTY_PAGE_SCALE_BASE,
  GENERIC_DIFFICULTY_SHORT_BOOK_SHIFT,
  GENERIC_DIFFICULTY_SHORT_BOOK_THRESHOLD,
  PRACTICAL_MIN_PAGE_FLOOR,
  TIME_DIFFICULTY_RESPONSE_EXPONENT,
} from './constants';
import { normalizeFeasibilityMode } from './constraint-normalizers';
import type { ConstraintSet } from './types';
import { clamp, round1, safeNumber } from './utils';

export function pageBounds(constraints: ConstraintSet): {
  minPg: number;
  maxPg: number;
} {
  const minPg = Math.max(1, Math.trunc(constraints.minPg || 2) || 2);
  const maxPg = Math.max(minPg, Math.trunc(constraints.maxPg || 30) || 30);
  return { minPg, maxPg };
}

export function totalBudgetMinutes(constraints: ConstraintSet): number {
  return Math.max(1, safeNumber(constraints.hpd, 2) * 60);
}

export function slotBudgetMinutes(constraints: ConstraintSet): number {
  return Math.max(
    1,
    totalBudgetMinutes(constraints) /
      Math.max(1, Math.trunc(constraints.par || 2) || 2),
  );
}

export function minutesPerPage(
  diff: number,
  constraints: ConstraintSet,
): number {
  const shaped = Math.pow(
    Math.max(0.1, diff) / 5,
    Math.max(0.1, safeNumber(constraints.gam, 1.5)) *
      TIME_DIFFICULTY_RESPONSE_EXPONENT,
  );
  return Math.max(1, safeNumber(constraints.bmp, 20) * shaped);
}

export function totalHours(
  pages: number,
  diff: number,
  constraints: ConstraintSet,
): number {
  return (pages * minutesPerPage(diff, constraints)) / 60;
}

export function effectiveFloorPg(
  diff: number,
  constraints: ConstraintSet,
): number {
  const bounds = pageBounds(constraints);
  const strictMin = bounds.minPg;
  if (normalizeFeasibilityMode(constraints.feasibilityMode) !== 'practical')
    return strictMin;
  const relaxed =
    slotBudgetMinutes(constraints) /
    Math.max(0.1, minutesPerPage(diff, constraints));
  return clamp(
    Math.min(strictMin, relaxed),
    PRACTICAL_MIN_PAGE_FLOOR,
    bounds.maxPg,
  );
}

export function allowedDayWindow(
  pages: number,
  constraints: ConstraintSet,
  minPgOverride?: number,
): { minDays: number; maxDays: number } {
  const bounds = pageBounds(constraints);
  const safePages = Math.max(1, Math.round(pages || 1));
  const minDays = Math.max(1, Math.ceil(safePages / Math.max(1, bounds.maxPg)));
  const floorPg = Math.max(1, safeNumber(minPgOverride, bounds.minPg));
  const maxDays = Math.max(
    minDays,
    safePages < floorPg ? 1 : Math.floor(safePages / Math.max(1, floorPg)) || 1,
  );
  return { minDays, maxDays };
}

export function dailyPagesTarget(
  pages: number,
  diff: number,
  constraints: ConstraintSet,
): number {
  const bounds = pageBounds(constraints);
  const laneMinutes = slotBudgetMinutes(constraints);
  const target = laneMinutes / Math.max(0.1, minutesPerPage(diff, constraints));
  return clamp(target, effectiveFloorPg(diff, constraints), bounds.maxPg);
}

export function studyDays(
  pages: number,
  diff: number,
  constraints: ConstraintSet,
): number {
  return Math.max(
    1,
    Math.ceil(
      Math.max(1, pages || 1) /
        Math.max(0.1, dailyPagesTarget(pages, diff, constraints)),
    ),
  );
}

export function pagesPerDay(
  diff: number,
  pages: number,
  constraints: ConstraintSet,
): number {
  return round1(
    Math.max(1, pages || 1) / Math.max(1, studyDays(pages, diff, constraints)),
  );
}

export function genericEstimateDifficulty(
  title: string,
  pages: number,
  subjects: string[],
  publisher: string,
  normalizeText: (text: string) => string,
  introCues: string[],
  advancedCues: string[],
): number {
  const text = normalizeText([title, subjects.join(' '), publisher].join(' '));
  let score = GENERIC_DIFFICULTY_BASE;
  if (introCues.some((cue) => text.includes(cue)))
    score += GENERIC_DIFFICULTY_INTRO_SHIFT;
  if (advancedCues.some((cue) => text.includes(cue)))
    score += GENERIC_DIFFICULTY_ADVANCED_SHIFT;
  if (pages > GENERIC_DIFFICULTY_LONG_BOOK_THRESHOLD)
    score += GENERIC_DIFFICULTY_LONG_BOOK_SHIFT;
  else if (pages > GENERIC_DIFFICULTY_MEDIUM_BOOK_THRESHOLD)
    score += GENERIC_DIFFICULTY_MEDIUM_BOOK_SHIFT;
  else if (pages < GENERIC_DIFFICULTY_SHORT_BOOK_THRESHOLD)
    score += GENERIC_DIFFICULTY_SHORT_BOOK_SHIFT;
  score += clamp(
    Math.log2(Math.max(1, pages) / GENERIC_DIFFICULTY_PAGE_SCALE_BASE) *
      GENERIC_DIFFICULTY_PAGE_LOG_WEIGHT,
    GENERIC_DIFFICULTY_PAGE_LOG_MIN,
    GENERIC_DIFFICULTY_PAGE_LOG_MAX,
  );
  return round1(clamp(score, 1, 10));
}
