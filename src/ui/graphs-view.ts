import { selectGraphOptionsViewModel } from '../app/selectors/constraints';
import { selectGraphRenderModel } from '../app/selectors/graph-render-data';
import type { AppState, PlannerStore } from '../core/types';
import { renderConstraintField } from './constraint-field';
import { card, el } from './dom';
import { renderGraphPanels } from './diagnostics-graphs';
import {
  renderDifficultyChart,
  renderParallelChart,
  renderWeeklyLoadChart,
} from './planner-charts';

function renderGraphOptions(state: AppState, store: PlannerStore): HTMLElement {
  const viewModel = selectGraphOptionsViewModel(state);
  const fields = viewModel.groups.flatMap((group) => group.fields);
  return card(
    'Graph options',
    el(
      'details',
      { className: 'graph-options-dropdown' },
      el('summary', {
        className: 'graph-options-summary',
        text: 'Graph behavior settings',
      }),
      el(
        'div',
        { className: 'form-grid settings-grid graph-options-grid' },
        ...fields.map((field) => renderConstraintField(field, viewModel.constraints, store)),
      ),
    ),
  );
}

export function renderGraphsView(state: AppState, store: PlannerStore): HTMLElement {
  return el(
    'div',
    { className: 'stack-layout' },
    card(
      'Graphs',
      el(
        'div',
        { className: 'muted-copy' },
        'Explore prerequisites, co-study links, topic overlap, weekly load, occupancy, and the difficulty ladder.',
      ),
    ),
    renderGraphOptions(state, store),
    renderGraphPanels(selectGraphRenderModel(state)),
    el(
      'div',
      { className: 'planner-chart-grid' },
      renderWeeklyLoadChart(state),
      renderParallelChart(state),
      renderDifficultyChart(state, store),
    ),
  );
}
