import type { AppState, PlanColorMode } from '../../core/types';
import { safeNumber } from '../../core/utils';
import { gradientColor, hashText, normalizedRange } from './color-utils';

const MONO_GROUP_HUE_START = 160;
const MONO_GROUP_HUE_SPAN = 34;
const DIFFICULTY_GRADIENT_START_HUE = 145;
const DIFFICULTY_GRADIENT_END_HUE = 18;
const READING_TIME_GRADIENT_START_HUE = 205;
const READING_TIME_GRADIENT_END_HUE = 42;

export interface PlanColorMetadata {
  mode: PlanColorMode;
  byBookId: Record<string, string>;
}

function monoGroupColor(group: string): string {
  const colorHue =
    MONO_GROUP_HUE_START +
    (hashText(group || 'Ungrouped') % MONO_GROUP_HUE_SPAN);
  return `hsl(${colorHue} 42% 55%)`;
}

function detectedGenreLabel(state: AppState, bookId: string): string {
  const book = state.project.library.books[bookId];
  const candidates = [
    ...(book?.subjects ?? []),
    ...(book?.enrichment.olSubjects ?? []),
    ...state.snapshot.topics
      .filter((topic) =>
        topic.chapterAnchors.some((anchor) => anchor.bookId === bookId),
      )
      .map((topic) => topic.label),
  ];
  return (
    candidates
      .map((value) => value.trim())
      .filter(Boolean)
      .sort(
        (left, right) =>
          left.length - right.length || left.localeCompare(right),
      )[0] || 'Ungenred'
  );
}

export function selectPlanColors(state: AppState): PlanColorMetadata {
  const mode = state.ui.planColorMode;
  const items = state.snapshot.schedulePlan.items;
  const difficulties = items.map(
    (item) => item.displayDifficulty || item.scheduleDifficulty,
  );
  const readingHours = items.map((item) => {
    const stat = state.snapshot.dayPlan.byBookStats[item.id];
    return safeNumber(stat?.minutes, item.hours * 60) / 60;
  });

  return {
    mode,
    byBookId: Object.fromEntries(
      items.map((item, index) => {
        if (mode === 'difficulty_gradient') {
          const pct = normalizedRange(
            difficulties,
            item.displayDifficulty || item.scheduleDifficulty,
          );
          return [
            item.id,
            gradientColor(
              pct,
              DIFFICULTY_GRADIENT_START_HUE,
              DIFFICULTY_GRADIENT_END_HUE,
            ),
          ];
        }
        if (mode === 'reading_time_gradient') {
          const pct = normalizedRange(readingHours, readingHours[index] ?? 0);
          return [
            item.id,
            gradientColor(
              pct,
              READING_TIME_GRADIENT_START_HUE,
              READING_TIME_GRADIENT_END_HUE,
            ),
          ];
        }
        if (mode === 'detected_genre') {
          return [item.id, monoGroupColor(detectedGenreLabel(state, item.id))];
        }
        return [item.id, monoGroupColor(item.displayGroup || item.id)];
      }),
    ),
  };
}
