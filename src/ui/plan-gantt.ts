import type { GanttViewModel, PlanViewModel } from '../app/selectors/plan';
import type { PlannerStore } from '../core/types';
import { el, emptyState } from './dom';
import { collapsibleCard } from './collapsible-card';
import { renderGanttRow } from './plan-gantt-row';
import { renderGanttToolbar } from './plan-gantt-toolbar';

function renderTimelineAxis(
  timelineLabel: (slot: number) => string,
  maxSlot: number,
  slotsPerWeek: number,
): HTMLElement {
  const safeSlotsPerWeek = Math.max(1, slotsPerWeek);
  const weekCount = Math.max(1, Math.ceil(maxSlot / safeSlotsPerWeek));
  return el(
    'div',
    { className: 'gantt-axis' },
    ...Array.from({ length: weekCount }, (_, index) => {
      const weekStart = index * safeSlotsPerWeek;
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
  bookJumpOptions: PlanViewModel['bookJumpOptions'],
  sectionOpen: boolean,
  selectedBookId: string | null,
  timelineLabel: (slot: number) => string,
  store: PlannerStore,
): HTMLElement {
  const rows = gantt.rows;
  if (!rows.length) {
    return collapsibleCard(
      'Gantt timeline',
      sectionOpen,
      (open) => store.commands.setPlanSectionOpen('gantt', open),
      emptyState(
        'No schedule yet',
        'Add books and constraints to generate a schedule.',
      ),
    );
  }

  const diagnostics = gantt.diagnostics;
  const maxSlot = gantt.maxSlot;

  return collapsibleCard(
    'Gantt timeline',
    sectionOpen,
    (open) => store.commands.setPlanSectionOpen('gantt', open),
    renderGanttToolbar(
      gantt,
      colors,
      emptyDayPolicy,
      bookJumpOptions,
      selectedBookId,
      store,
    ),
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
            renderTimelineAxis(timelineLabel, maxSlot, gantt.slotsPerWeek),
          ),
          ...rows.map((row) =>
            renderGanttRow(
              store,
              row,
              colors.byBookId[row.id] || 'hsl(160 42% 55%)',
              maxSlot,
              gantt.slotsPerWeek,
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
