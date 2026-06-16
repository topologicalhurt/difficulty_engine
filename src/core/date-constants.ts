export const DAYS_PER_WEEK = 7;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const WEEK_START_DAY = 1;

// Canonical calendar time-grid constants. These were previously redeclared
// (under several names) in the placement selector, the activity command
// helper, the persistence normalizer, and the render layer; centralizing them
// here keeps clamp/snap boundaries from drifting between those paths.
export const DAY_MINUTES = 24 * 60;
export const TIME_BLOCK_GRANULARITY_MINUTES = 15;
export const MIN_TIME_BLOCK_DURATION_MINUTES = 15;
export const MAX_TIME_BLOCK_DURATION_MINUTES = 12 * 60;

/** Round a minute-of-day value to the nearest time-grid step. */
export function snapToTimeGrid(value: number): number {
  return (
    Math.round(value / TIME_BLOCK_GRANULARITY_MINUTES) *
    TIME_BLOCK_GRANULARITY_MINUTES
  );
}
