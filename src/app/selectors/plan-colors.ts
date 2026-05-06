import type { AppState, PlanColorMode } from '../../core/types';
import { safeNumber } from '../../core/utils';
import {
  gradientColor,
  groupColor,
  normalizedRange,
  PLAN_DIFFICULTY_GRADIENT,
  PLAN_MONO_GROUP_COLOR_OPTIONS,
  PLAN_READING_TIME_GRADIENT,
} from '../../core/display-colors';

export interface PlanColorMetadata {
  mode: PlanColorMode;
  byBookId: Record<string, string>;
}

function monoGroupColor(group: string): string {
  return groupColor(group, PLAN_MONO_GROUP_COLOR_OPTIONS);
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
              PLAN_DIFFICULTY_GRADIENT.startHue,
              PLAN_DIFFICULTY_GRADIENT.endHue,
            ),
          ];
        }
        if (mode === 'reading_time_gradient') {
          const pct = normalizedRange(readingHours, readingHours[index] ?? 0);
          return [
            item.id,
            gradientColor(
              pct,
              PLAN_READING_TIME_GRADIENT.startHue,
              PLAN_READING_TIME_GRADIENT.endHue,
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
