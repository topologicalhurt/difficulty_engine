import { CONSTRAINT_FIELDS } from '../../core/defaults';
import type { AppState, ConstraintSet } from '../../core/types';
import { unique } from '../../core/utils';
import {
  constraintFieldView,
  type ConstraintFieldView,
} from './constraint-metadata';
import {
  selectDifficultyMappingViewModel,
  type DifficultyMappingViewModel,
} from './difficulty-mapping';

export const GRAPH_CONSTRAINT_GROUP = 'Graph Controls';
const DIFFICULTY_MAPPING_GROUP = 'Difficulty Mapping';

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

export interface ConstraintsViewModel {
  constraints: ConstraintSet;
  groups: ConstraintGroupViewModel[];
  explanation: ConstraintExplanationViewModel;
  difficultyMapping: DifficultyMappingViewModel;
}

type ConstraintFieldPredicate = (field: (typeof CONSTRAINT_FIELDS)[number]) => boolean;

function groupFields(
  fields: ConstraintFieldView[],
  openGroups: string[],
): ConstraintGroupViewModel[] {
  const groups = unique(fields.map((field) => field.group));
  return groups.map((group) => ({
    group,
    fields: fields.filter(
      (field) =>
        field.group === group &&
        (!field.advanced || openGroups.includes(group)),
    ),
    advancedOpen: openGroups.includes(group),
    hiddenAdvancedCount: fields.filter(
      (field) => field.group === group && field.advanced,
    ).length,
  }));
}

function selectedExplanation(
  fields: ConstraintFieldView[],
  constraints: ConstraintSet,
  selectedKey: keyof ConstraintSet | null,
): ConstraintExplanationViewModel {
  const field = fields.find((entry) => entry.key === selectedKey) ?? fields[0];
  if (!field) {
    return {
      title: 'Settings',
      summary: 'Select a setting to inspect it.',
      detail: '',
      selectedOptionDetail: null,
    };
  }
  const selectedValue = String(constraints[field.key] ?? '');
  return {
    title: field.label,
    summary: field.summary,
    detail: field.detail,
    selectedOptionDetail: field.optionDetails[selectedValue] ?? null,
  };
}

export function selectConstraintsViewModel(
  state: AppState,
): ConstraintsViewModel {
  return selectConstraintSurfaceViewModel(
    state,
    (field) => field.group !== GRAPH_CONSTRAINT_GROUP,
  );
}

export function selectGraphOptionsViewModel(
  state: AppState,
): ConstraintsViewModel {
  return selectConstraintSurfaceViewModel(
    state,
    (field) => field.group === GRAPH_CONSTRAINT_GROUP,
  );
}

function selectConstraintSurfaceViewModel(
  state: AppState,
  includeField: ConstraintFieldPredicate,
): ConstraintsViewModel {
  const fields = CONSTRAINT_FIELDS.filter(includeField).map(constraintFieldView);
  return {
    constraints: state.project.constraints,
    groups: groupFields(fields, state.ui.openConstraintGroups),
    explanation: selectedExplanation(
      fields,
      state.project.constraints,
      state.ui.selectedConstraintKey,
    ),
    difficultyMapping: selectDifficultyMappingViewModel(state),
  };
}

export { DIFFICULTY_MAPPING_GROUP };
