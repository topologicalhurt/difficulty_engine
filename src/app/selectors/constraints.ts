import { CONSTRAINT_FIELDS } from '../../core/defaults';
import {
  difficultyDistributionStats,
  mapDisplayDifficulty,
  normalizedCurveWindow,
} from '../../core/difficulty-mapping';
import type { AppState, ConstraintSet } from '../../core/types';
import { round1 } from '../../core/utils';
import { constraintFieldView, type ConstraintFieldView } from './constraint-metadata';

export const GRAPH_CONSTRAINT_GROUP = 'Graph Controls';
const DIFFICULTY_MAPPING_GROUP = 'Difficulty Mapping';
const SAMPLE_COUNT = 25;
const DIFFICULTY_COLOR_START_HUE = 158;
const DIFFICULTY_COLOR_HUE_SPAN = 120;
const DIFFICULTY_SCORE_MIN = 1;
const DIFFICULTY_SCORE_SPAN = 9;
const BOOK_DOT_OFFSET_COUNT = 5;
const BOOK_DOT_OFFSET_CENTER = 2;
const BOOK_DOT_OFFSET_STEP = 3;

export interface ConstraintGroupViewModel {
  group: string;
  fields: ConstraintFieldView[];
  advancedOpen: boolean;
  hiddenAdvancedCount: number;
}

export interface ConstraintExplanationViewModel {
  title: string;
  summary: string;
  detail: string;
  selectedOptionDetail: string | null;
}

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
  const t = Math.max(0, Math.min(1, (score - DIFFICULTY_SCORE_MIN) / DIFFICULTY_SCORE_SPAN));
  const colorHue = DIFFICULTY_COLOR_START_HUE - t * DIFFICULTY_COLOR_HUE_SPAN;
  return `hsl(${Math.round(colorHue)} 72% 58%)`;
}

export interface ConstraintsViewModel {
  constraints: ConstraintSet;
  groups: ConstraintGroupViewModel[];
  explanation: ConstraintExplanationViewModel;
  difficultyMapping: DifficultyMappingViewModel;
}

function groupFields(
  fields: ConstraintFieldView[],
  openGroups: string[],
): ConstraintGroupViewModel[] {
  const groups = [...new Set(fields.map((field) => field.group))];
  return groups.map((group) => ({
    group,
    fields: fields.filter(
      (field) => field.group === group && (!field.advanced || openGroups.includes(group)),
    ),
    advancedOpen: openGroups.includes(group),
    hiddenAdvancedCount: fields.filter((field) => field.group === group && field.advanced).length,
  }));
}

function selectedExplanation(
  fields: ConstraintFieldView[],
  constraints: ConstraintSet,
  selectedKey: keyof ConstraintSet | null,
): ConstraintExplanationViewModel {
  const field = fields.find((entry) => entry.key === selectedKey) ?? fields[0];
  if (!field) {
    return { title: 'Settings', summary: 'Select a setting to inspect it.', detail: '', selectedOptionDetail: null };
  }
  const selectedValue = String(constraints[field.key] ?? '');
  return {
    title: field.label,
    summary: field.summary,
    detail: field.detail,
    selectedOptionDetail: field.optionDetails[selectedValue] ?? null,
  };
}

export function selectDifficultyMappingViewModel(state: AppState): DifficultyMappingViewModel {
  const entries = Object.entries(state.snapshot.difficultyModel).map(([id, difficulty]) => {
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
  });
  const offsetById = new Map<string, number>();
  [...entries]
    .sort((left, right) => left.rawDifficulty - right.rawDifficulty || left.title.localeCompare(right.title))
    .forEach((entry, index) => {
      offsetById.set(
        entry.id,
        ((index % BOOK_DOT_OFFSET_COUNT) - BOOK_DOT_OFFSET_CENTER) * BOOK_DOT_OFFSET_STEP,
      );
    });
  const stats = difficultyDistributionStats(entries.map((entry) => entry.rawDifficulty));
  const curveWindow = normalizedCurveWindow(state.project.constraints);
  const curve = Array.from({ length: SAMPLE_COUNT }, (_, index) => {
    const sampledDifficulty =
      DIFFICULTY_SCORE_MIN +
      (DIFFICULTY_SCORE_SPAN * index) / Math.max(1, SAMPLE_COUNT - 1);
    return {
      rawDifficulty: round1(sampledDifficulty),
      displayDifficulty: mapDisplayDifficulty(sampledDifficulty, state.project.constraints, stats),
    };
  });
  const identity = curve.map((point) => ({
    rawDifficulty: point.rawDifficulty,
    displayDifficulty: point.rawDifficulty,
  }));
  const rawForPercentile = (percentile: number): number =>
    state.project.constraints.diffMapMode === 'scaled' && stats.spread > 0
      ? stats.min + stats.spread * percentile
      : DIFFICULTY_SCORE_MIN + DIFFICULTY_SCORE_SPAN * percentile;
  const mappedStats = difficultyDistributionStats(entries.map((entry) => entry.displayDifficulty));
  const sortedByMapped = [...entries].sort(
    (left, right) => left.displayDifficulty - right.displayDifficulty || left.title.localeCompare(right.title),
  );
  return {
    curve,
    identity,
    floorGuide: curveWindow.floorPoint > 0
      ? {
          rawDifficulty: round1(rawForPercentile(curveWindow.floorPoint)),
          displayDifficulty: round1(mapDisplayDifficulty(rawForPercentile(curveWindow.floorPoint), state.project.constraints, stats)),
        }
      : null,
    ceilingGuide: curveWindow.ceilingPoint < 1
      ? {
          rawDifficulty: round1(rawForPercentile(curveWindow.ceilingPoint)),
          displayDifficulty: round1(mapDisplayDifficulty(rawForPercentile(curveWindow.ceilingPoint), state.project.constraints, stats)),
        }
      : null,
    legendLabels: ['Identity', 'Current curve', 'Books'],
    books: entries.map((entry) => ({ ...entry, plotOffset: offsetById.get(entry.id) ?? 0 })),
    rawSpread: round1(stats.spread),
    mappedSpread: round1(mappedStats.spread),
    lowestBook: sortedByMapped[0]?.title ?? 'No books yet',
    highestBook: sortedByMapped[sortedByMapped.length - 1]?.title ?? 'No books yet',
    modeExplanation:
      state.project.constraints.diffMapMode === 'scaled'
        ? 'Scaled mode stretches this library into the configured display range.'
        : 'Raw mode keeps displayed difficulty close to the engine score.',
  };
}

export function selectConstraintsViewModel(state: AppState): ConstraintsViewModel {
  const fields = CONSTRAINT_FIELDS
    .filter((field) => field.group !== GRAPH_CONSTRAINT_GROUP)
    .map(constraintFieldView);
  return {
    constraints: state.project.constraints,
    groups: groupFields(fields, state.ui.openConstraintGroups),
    explanation: selectedExplanation(fields, state.project.constraints, state.ui.selectedConstraintKey),
    difficultyMapping: selectDifficultyMappingViewModel(state),
  };
}

export function selectGraphOptionsViewModel(state: AppState): ConstraintsViewModel {
  const fields = CONSTRAINT_FIELDS
    .filter((field) => field.group === GRAPH_CONSTRAINT_GROUP)
    .map(constraintFieldView);
  return {
    constraints: state.project.constraints,
    groups: groupFields(fields, state.ui.openConstraintGroups),
    explanation: selectedExplanation(fields, state.project.constraints, state.ui.selectedConstraintKey),
    difficultyMapping: selectDifficultyMappingViewModel(state),
  };
}

export { DIFFICULTY_MAPPING_GROUP };
