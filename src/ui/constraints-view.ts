import {
  DIFFICULTY_MAPPING_GROUP,
  selectConstraintsViewModel,
  type ConstraintsViewModel,
} from '../app/selectors/constraints';
import type { AppState, PlannerStore } from '../core/types';
import { renderConstraintField } from './constraint-field';
import { renderDifficultyMappingChart } from './difficulty-mapping-chart';
import { card, el } from './dom';

function renderExplanation(viewModel: ConstraintsViewModel): HTMLElement {
  const showDetail =
    viewModel.explanation.detail &&
    viewModel.explanation.detail !== viewModel.explanation.summary;
  return card(
    'Context',
    el(
      'div',
      { className: 'settings-context' },
      el('strong', { text: viewModel.explanation.title }),
      el('p', { text: viewModel.explanation.summary }),
      showDetail
        ? el('p', {
            className: 'muted-copy',
            text: viewModel.explanation.detail,
          })
        : null,
      viewModel.explanation.selectedOptionDetail
        ? el('div', {
            className: 'settings-option-detail',
            text: viewModel.explanation.selectedOptionDetail,
          })
        : null,
    ),
  );
}

function renderConstraintGroup(
  group: ConstraintsViewModel['groups'][number],
  viewModel: ConstraintsViewModel,
  store: PlannerStore,
): HTMLElement {
  return card(
    group.group,
    group.hiddenAdvancedCount
      ? el(
          'div',
          { className: 'settings-group-toolbar' },
          el('span', {
            className: 'muted-copy',
            text: `${group.hiddenAdvancedCount} advanced setting(s)`,
          }),
          el('button', {
            className: 'ghost-button compact-button',
            text: group.advancedOpen ? 'Hide advanced' : 'Show advanced',
            onClick: () =>
              store.commands.toggleConstraintAdvancedGroup(group.group),
          }),
        )
      : null,
    group.group === DIFFICULTY_MAPPING_GROUP
      ? renderDifficultyMappingChart(viewModel.difficultyMapping)
      : null,
    el(
      'div',
      { className: 'form-grid settings-grid' },
      ...group.fields.map((field) =>
        renderConstraintField(field, viewModel.constraints, store),
      ),
    ),
  );
}

export function renderConstraintsView(
  state: AppState,
  store: PlannerStore,
): HTMLElement {
  const viewModel = selectConstraintsViewModel(state);
  return el(
    'div',
    { className: 'stack-layout settings-shell' },
    card(
      'Planner settings',
      el(
        'div',
        { className: 'muted-copy' },
        'Tune how the planner estimates difficulty, pacing, and scheduling behavior.',
      ),
    ),
    el(
      'div',
      { className: 'settings-layout-grid' },
      el(
        'div',
        { className: 'settings-groups-column' },
        ...viewModel.groups.map((group) =>
          renderConstraintGroup(group, viewModel, store),
        ),
      ),
      el(
        'aside',
        { className: 'settings-context-sidebar' },
        renderExplanation(viewModel),
      ),
    ),
  );
}
