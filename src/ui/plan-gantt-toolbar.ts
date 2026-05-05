import type { GanttViewModel, PlanViewModel } from '../app/selectors/plan';
import type {
  EmptyDayPolicy,
  PlanColorMode,
  PlannerStore,
} from '../core/types';
import { button, el } from './dom';
import { selectInput } from './form-controls';
import { formatPercent } from './format';

function renderPlanColorSelect(
  mode: PlanColorMode,
  store: PlannerStore,
): HTMLSelectElement {
  return selectInput(
    mode,
    [
      { value: 'category_mono', label: 'Category mono' },
      { value: 'detected_genre', label: 'Detected genre' },
      { value: 'difficulty_gradient', label: 'Difficulty gradient' },
      { value: 'reading_time_gradient', label: 'Reading time gradient' },
    ],
    {
      className: 'select-input plan-color-select',
      ariaLabel: 'Plan color mode',
      onChange: (event) => {
        store.commands.setPlanColorMode(
          (event.target as HTMLSelectElement).value as PlanColorMode,
        );
      },
    },
  );
}

function renderEmptyDayPolicySelect(
  mode: EmptyDayPolicy,
  store: PlannerStore,
): HTMLSelectElement {
  return selectInput(
    mode,
    [
      { value: 'fill_when_possible', label: 'Fill whenever possible' },
      { value: 'preserve_schedule_gaps', label: 'Preserve schedule gaps' },
    ],
    {
      className: 'select-input plan-fill-select',
      ariaLabel: 'Empty day behavior',
      onChange: (event) => {
        store.commands.updateConstraint(
          'emptyDayPolicy',
          (event.target as HTMLSelectElement).value as EmptyDayPolicy,
        );
      },
    },
  );
}

export function renderGanttToolbar(
  gantt: GanttViewModel,
  colors: PlanViewModel['colors'],
  emptyDayPolicy: PlanViewModel['emptyDayPolicy'],
  store: PlannerStore,
): HTMLElement {
  const zoomLabel = formatPercent(gantt.zoom);

  return el(
    'div',
    { className: 'toolbar-row' },
    button('−', {
      className: 'ghost-button gantt-zoom-button',
      onClick: () => store.commands.setGanttZoom(gantt.zoom - 0.2),
    }),
    button(zoomLabel, {
      className: 'ghost-button gantt-zoom-button',
      onClick: () => store.commands.setGanttZoom(1),
    }),
    button('+', {
      className: 'ghost-button gantt-zoom-button',
      onClick: () => store.commands.setGanttZoom(gantt.zoom + 0.2),
    }),
    button('Timeline', {
      className: gantt.view === 'plan' ? 'primary-button' : 'ghost-button',
      onClick: () => store.commands.setGanttView('plan'),
    }),
    button('Diagnostics', {
      className:
        gantt.view === 'diagnostics' ? 'primary-button' : 'ghost-button',
      onClick: () => store.commands.setGanttView('diagnostics'),
    }),
    el(
      'label',
      { className: 'inline-control muted-copy' },
      el('span', { text: 'Color' }),
      renderPlanColorSelect(colors.mode, store),
    ),
    el(
      'label',
      { className: 'inline-control muted-copy' },
      el('span', { text: 'Empty days' }),
      renderEmptyDayPolicySelect(emptyDayPolicy, store),
    ),
    el('div', {
      className: 'muted-copy',
      text: `${gantt.rows.length} scheduled books · ${gantt.weekCount} visible weeks · scroll horizontally`,
    }),
  );
}
