import { selectPlanViewModel, type StatCardView } from '../app/selectors/plan';
import type { AppState, PlannerStore } from '../core/types';
import { el } from './dom';
import { renderSelectedCalendarLogPanel } from './calendar-log-panel';
import { renderLibrarySearchPanel } from './library-search-panel';
import { renderCalendar } from './plan-calendar';
import { renderGantt } from './plan-gantt';
import { renderBookInspector, renderWarningCenter } from './plan-side-panel';

function renderStats(cards: StatCardView[]): HTMLElement {
  return el(
    'div',
    { className: 'stats-grid planner-stats-grid' },
    ...cards.map((item) =>
      el(
        'div',
        { className: 'stat-card planner-stat-card' },
        el('div', { className: 'stat-value', text: item.value }),
        el('div', { className: 'stat-label', text: item.label }),
        el('div', { className: 'stat-hint muted-copy', text: item.hint }),
      ),
    ),
  );
}

function renderQuickAddPanel(
  state: AppState,
  store: PlannerStore,
): HTMLElement {
  return renderLibrarySearchPanel(state, store, {
    compact: true,
    title: 'Quick add',
  });
}

export function renderPlanView(
  state: AppState,
  store: PlannerStore,
): HTMLElement {
  const viewModel = selectPlanViewModel(state);
  return el(
    'div',
    { className: 'planner-layout' },
    renderStats(viewModel.stats),
    el(
      'div',
      { className: 'planner-main-grid' },
      el(
        'div',
        { className: 'planner-main-column' },
        renderQuickAddPanel(state, store),
        renderGantt(
          viewModel.gantt,
          viewModel.colors,
          viewModel.emptyDayPolicy,
          viewModel.bookJumpOptions,
          viewModel.planSections.gantt,
          viewModel.selectedBookId,
          viewModel.timelineLabel,
          store,
        ),
        renderCalendar(viewModel, store),
      ),
      el(
        'div',
        { className: 'planner-side-column' },
        renderSelectedCalendarLogPanel(viewModel, store),
        renderWarningCenter(
          viewModel.warnings,
          viewModel.hiddenWarningCount,
          store,
        ),
        renderBookInspector(viewModel.inspector, viewModel.timelineLabel, store),
      ),
    ),
  );
}
