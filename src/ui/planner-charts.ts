import type { AppState, PlannerStore } from '../core/types';
import { badge, card, el, emptyState } from './dom';
import {
  buildDifficultySeries,
  buildParallelSeries,
  buildWeeklyLoadSeries,
} from '../app/selectors/plan-view-model';
import { colorForGroup, formatCssPercent, formatOneDecimal, round0 } from './format';

export function renderWeeklyLoadChart(state: AppState): HTMLElement {
  const points = buildWeeklyLoadSeries(state);
  const maxHours = Math.max(1, ...points.map((point) => Math.max(point.hours, point.targetHours)));
  if (!points.length) {
    return card('Weekly load', emptyState('No workload yet', 'Solve the plan to see weekly effort.'));
  }

  return card(
    'Weekly load',
    el(
      'div',
      { className: 'chart-card-copy muted-copy' },
      `Study load by week against the current ${round0(points[0]?.targetHours ?? 0)} hour target.`,
    ),
    el(
      'div',
      { className: 'bar-chart' },
      ...points.map((point) =>
        el(
          'div',
          { className: 'bar-chart-col', title: `${point.label}: ${formatOneDecimal(point.hours)}h` },
          el(
            'div',
            { className: 'bar-chart-stack' },
            (() => {
              const target = el('div', { className: 'bar-target' });
              target.style.height = formatCssPercent(point.targetHours / maxHours);
              return target;
            })(),
            (() => {
              const bar = el('div', { className: 'bar-fill' });
              bar.style.height = formatCssPercent(point.hours / maxHours);
              return bar;
            })(),
          ),
          el('div', { className: 'bar-value', text: formatOneDecimal(point.hours) }),
          el('div', { className: 'bar-label', text: point.label }),
        ),
      ),
    ),
  );
}

export function renderParallelChart(state: AppState): HTMLElement {
  const points = buildParallelSeries(state);
  const targetBooks = points[0]?.targetBooks ?? 1;
  const maxValue = Math.max(1, targetBooks, ...points.map((point) => point.activeBooks));
  if (!points.length) {
    return card('Parallel occupancy', emptyState('No occupancy data yet', 'Daily concurrency appears once study days exist.'));
  }

  return card(
    'Parallel occupancy',
    el(
      'div',
      { className: 'chart-card-copy muted-copy' },
      `Daily active-book count against the ${targetBooks}-slot target.`,
    ),
    el(
      'div',
      { className: 'bar-chart compact-chart' },
      ...points.map((point) =>
        el(
          'div',
          { className: 'bar-chart-col', title: `${point.label}: ${point.activeBooks} active books` },
          el(
            'div',
            { className: 'bar-chart-stack' },
            (() => {
              const target = el('div', { className: 'bar-target' });
              target.style.height = formatCssPercent(targetBooks / maxValue);
              return target;
            })(),
            (() => {
              const bar = el('div', {
                className: `bar-fill${point.activeBooks < targetBooks ? ' bar-fill-muted' : ''}`,
              });
              bar.style.height = formatCssPercent(point.activeBooks / maxValue);
              return bar;
            })(),
          ),
          el('div', { className: 'bar-value', text: String(point.activeBooks) }),
          el('div', { className: 'bar-label', text: point.label }),
        ),
      ),
    ),
  );
}

export function renderDifficultyChart(state: AppState, store: PlannerStore): HTMLElement {
  const points = buildDifficultySeries(state);
  const maxValue = Math.max(1, ...points.map((point) => point.score));
  if (!points.length) {
    return card('Difficulty ladder', emptyState('No difficulty data yet', 'Difficulty scores appear after inference.'));
  }

  return card(
    'Difficulty ladder',
    el(
      'div',
      { className: 'chart-card-copy muted-copy' },
      'Sorted schedule difficulty ladder for the currently active library.',
    ),
    el(
      'div',
      { className: 'stack-list compact-stack' },
      ...points.map((point) =>
        el(
          'button',
          {
            className: `ladder-row${point.selected ? ' selected' : ''}`,
            type: 'button',
            onClick: () => store.commands.selectBook(point.id),
          },
          el(
            'div',
            { className: 'ladder-top' },
            el('strong', { text: point.label }),
            badge(formatOneDecimal(point.score)),
          ),
          el(
            'div',
            { className: 'ladder-bar' },
            (() => {
              const fill = el('div', { className: 'ladder-fill' });
              fill.style.width = formatCssPercent(point.score / maxValue);
              fill.style.background = colorForGroup(point.displayGroup);
              return fill;
            })(),
          ),
        ),
      ),
    ),
  );
}
