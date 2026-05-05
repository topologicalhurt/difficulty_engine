import type { GanttViewModel, PlanViewModel } from '../app/selectors/plan';
import { DAYS_PER_WEEK } from '../core/date-constants';
import type { PlannerStore } from '../core/types';
import { card, el, emptyState } from './dom';
import { renderGanttRow } from './plan-gantt-row';
import { renderGanttToolbar } from './plan-gantt-toolbar';

function renderTimelineAxis(
  timelineLabel: (slot: number) => string,
  maxSlot: number,
): HTMLElement {
  const weekCount = Math.max(1, Math.ceil(maxSlot / DAYS_PER_WEEK));
  return el(
    'div',
    { className: 'gantt-axis' },
    ...Array.from({ length: weekCount }, (_, index) => {
      const weekStart = index * DAYS_PER_WEEK;
      const label = `Week ${index + 1}`;
      return el(
        'div',
        {
          className: 'gantt-axis-cell',
          title: `${label} · starts ${timelineLabel(weekStart)}`,
        },
        el('strong', { text: label }),
        el('span', { className: 'muted-copy', text: timelineLabel(weekStart) }),
      );
    }),
  );
}

export function renderGantt(
  gantt: GanttViewModel,
  colors: PlanViewModel['colors'],
  emptyDayPolicy: PlanViewModel['emptyDayPolicy'],
  selectedBookId: string | null,
  timelineLabel: (slot: number) => string,
  store: PlannerStore,
): HTMLElement {
  const rows = gantt.rows;
  if (!rows.length) {
    return card(
      'Gantt timeline',
      emptyState(
        'No schedule yet',
        'Add books and constraints to generate a schedule.',
      ),
    );
  }

  const diagnostics = gantt.diagnostics;
  const maxSlot = gantt.maxSlot;

  return card(
    'Gantt timeline',
    renderGanttToolbar(gantt, colors, emptyDayPolicy, store),
    el(
      'div',
      { className: 'gantt-scroll-wrap' },
      (() => {
        const board = el(
          'div',
          { className: 'gantt-board' },
          el(
            'div',
            { className: 'gantt-board-head' },
            el('div', {
              className: 'gantt-head-meta muted-copy',
              text: 'Books',
            }),
            renderTimelineAxis(timelineLabel, maxSlot),
          ),
          ...rows.map((row) =>
            renderGanttRow(
              store,
              row,
              colors.byBookId[row.id] || 'hsl(160 42% 55%)',
              maxSlot,
              diagnostics,
              selectedBookId,
              timelineLabel,
            ),
          ),
        );
        board.style.minWidth = `${gantt.boardMinWidth}px`;
        return board;
      })(),
    ),
  );
}
