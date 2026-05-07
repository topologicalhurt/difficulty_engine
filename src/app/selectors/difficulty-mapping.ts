import {
  difficultyDistributionStats,
  mapDisplayDifficulty,
  normalizedCurveWindow,
  RAW_DIFFICULTY_MIN,
  RAW_DIFFICULTY_SPAN,
} from '../../core/difficulty-mapping';
import { gradientColor } from '../../core/display-colors';
import { compareChain, compareNumberAsc, compareText } from '../../core/sort';
import type { AppState } from '../../core/types';
import { round1 } from '../../core/utils';

const SAMPLE_COUNT = 25;
const DIFFICULTY_COLOR_START_HUE = 158;
const DIFFICULTY_COLOR_END_HUE = 38;
const DIFFICULTY_COLOR_LIGHTNESS = 58;
const BOOK_DOT_OFFSET_COUNT = 5;
const BOOK_DOT_OFFSET_CENTER = 2;
const BOOK_DOT_OFFSET_STEP = 3;

export interface DifficultyMappingPoint {
  rawDifficulty: number;
  displayDifficulty: number;
}

export interface DifficultyMappingBookPoint extends DifficultyMappingPoint {
  id: string;
  title: string;
  group: string;
  color: string;
  plotOffset: number;
}

export interface DifficultyMappingViewModel {
  curve: DifficultyMappingPoint[];
  identity: DifficultyMappingPoint[];
  floorGuide: DifficultyMappingPoint | null;
  ceilingGuide: DifficultyMappingPoint | null;
  legendLabels: string[];
  books: DifficultyMappingBookPoint[];
  rawSpread: number;
  mappedSpread: number;
  lowestBook: string;
  highestBook: string;
  modeExplanation: string;
}

function difficultyColor(score: number): string {
  const t = Math.max(
    0,
    Math.min(1, (score - RAW_DIFFICULTY_MIN) / RAW_DIFFICULTY_SPAN),
  );
  return gradientColor(
    t,
    DIFFICULTY_COLOR_START_HUE,
    DIFFICULTY_COLOR_END_HUE,
    DIFFICULTY_COLOR_LIGHTNESS,
  );
}

function rawForPercentile(
  percentile: number,
  diffMapMode: string,
  stats: ReturnType<typeof difficultyDistributionStats>,
): number {
  return diffMapMode === 'scaled' && stats.spread > 0
    ? stats.min + stats.spread * percentile
    : RAW_DIFFICULTY_MIN + RAW_DIFFICULTY_SPAN * percentile;
}

function sampledCurve(
  state: AppState,
  stats: ReturnType<typeof difficultyDistributionStats>,
): DifficultyMappingPoint[] {
  return Array.from({ length: SAMPLE_COUNT }, (_, index) => {
    const sampledDifficulty =
      RAW_DIFFICULTY_MIN +
      (RAW_DIFFICULTY_SPAN * index) / Math.max(1, SAMPLE_COUNT - 1);
    return {
      rawDifficulty: round1(sampledDifficulty),
      displayDifficulty: mapDisplayDifficulty(
        sampledDifficulty,
        state.project.constraints,
        stats,
      ),
    };
  });
}

function plotOffsets(
  entries: Array<{ id: string; rawDifficulty: number; title: string }>,
): Map<string, number> {
  const offsetById = new Map<string, number>();
  [...entries]
    .sort((left, right) =>
      compareChain(
        compareNumberAsc(left.rawDifficulty, right.rawDifficulty),
        compareText(left.title, right.title),
        compareText(left.id, right.id),
      ),
    )
    .forEach((entry, index) => {
      offsetById.set(
        entry.id,
        ((index % BOOK_DOT_OFFSET_COUNT) - BOOK_DOT_OFFSET_CENTER) *
          BOOK_DOT_OFFSET_STEP,
      );
    });
  return offsetById;
}

export function selectDifficultyMappingViewModel(
  state: AppState,
): DifficultyMappingViewModel {
  const entries = Object.entries(state.snapshot.difficultyModel).map(
    ([id, difficulty]) => {
      const book = state.project.library.books[id];
      return {
        id,
        title: book?.short || book?.title || id,
        group: book?.displayGroup || 'Ungrouped',
        rawDifficulty: difficulty.scheduleDifficulty,
        displayDifficulty: difficulty.displayDifficulty,
        color: difficultyColor(difficulty.displayDifficulty),
        plotOffset: 0,
      };
    },
  );
  const stats = difficultyDistributionStats(
    entries.map((entry) => entry.rawDifficulty),
  );
  const curveWindow = normalizedCurveWindow(state.project.constraints);
  const curve = sampledCurve(state, stats);
  const rawAtFloor = rawForPercentile(
    curveWindow.floorPoint,
    state.project.constraints.diffMapMode,
    stats,
  );
  const rawAtCeiling = rawForPercentile(
    curveWindow.ceilingPoint,
    state.project.constraints.diffMapMode,
    stats,
  );
  const mappedStats = difficultyDistributionStats(
    entries.map((entry) => entry.displayDifficulty),
  );
  const sortedByMapped = [...entries].sort(
    (left, right) =>
      compareChain(
        compareNumberAsc(left.displayDifficulty, right.displayDifficulty),
        compareText(left.title, right.title),
        compareText(left.id, right.id),
      ),
  );
  const offsetById = plotOffsets(entries);
  return {
    curve,
    identity: curve.map((point) => ({
      rawDifficulty: point.rawDifficulty,
      displayDifficulty: point.rawDifficulty,
    })),
    floorGuide:
      curveWindow.floorPoint > 0
        ? {
            rawDifficulty: round1(rawAtFloor),
            displayDifficulty: round1(
              mapDisplayDifficulty(
                rawAtFloor,
                state.project.constraints,
                stats,
              ),
            ),
          }
        : null,
    ceilingGuide:
      curveWindow.ceilingPoint < 1
        ? {
            rawDifficulty: round1(rawAtCeiling),
            displayDifficulty: round1(
              mapDisplayDifficulty(
                rawAtCeiling,
                state.project.constraints,
                stats,
              ),
            ),
          }
        : null,
    legendLabels: ['Identity', 'Current curve', 'Books'],
    books: entries.map((entry) => ({
      ...entry,
      plotOffset: offsetById.get(entry.id) ?? 0,
    })),
    rawSpread: round1(stats.spread),
    mappedSpread: round1(mappedStats.spread),
    lowestBook: sortedByMapped[0]?.title ?? 'No books yet',
    highestBook:
      sortedByMapped[sortedByMapped.length - 1]?.title ?? 'No books yet',
    modeExplanation:
      state.project.constraints.diffMapMode === 'scaled'
        ? 'Scaled mode stretches this library into the configured display range.'
        : 'Raw mode keeps displayed difficulty close to the engine score.',
  };
}
