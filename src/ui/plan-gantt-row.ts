import { DAYS_PER_WEEK } from '../core/date-constants';
import type { PlannerStore, ScheduleRow } from '../core/types';
import { badge, el } from './dom';
import { formatCssPercent, formatOneDecimal } from './format';

function rowBadges(row: ScheduleRow): HTMLElement[] {
  return [
    badge(`Lane ${row.lane + 1}`),
    row.floorRelaxed
      ? badge(
          `Floor ${formatOneDecimal(row.effectiveMinPg)}/${formatOneDecimal(row.strictMinPg)} pg`,
          'warn',
        )
      : null,
    row.backfilled ? badge('Backfilled', 'success') : null,
    row.prereqOverlapUsed ? badge('Prereq overlap', 'warn') : null,
    row.unresolvedPages > 0
      ? badge(`${formatOneDecimal(row.unresolvedPages)} unresolved`, 'danger')
      : null,
  ].filter(Boolean) as HTMLElement[];
}

export function renderGanttRow(
  store: PlannerStore,
  row: ScheduleRow,
  color: string,
  maxSlot: number,
  diagnostics: boolean,
  selectedBookId: string | null,
  timelineLabel: (slot: number) => string,
): HTMLElement {
  const selected = selectedBookId === row.id;
  const safeMaxSlot = Math.max(1, maxSlot);
  const targetStart = formatCssPercent(row.targetStart / safeMaxSlot);
  const targetWidth = formatCssPercent(
    Math.max(1, row.targetEnd - row.targetStart) / safeMaxSlot,
  );
  const actualStartSlot = row.actualStart ?? row.targetStart;
  const actualEndSlot = row.actualEnd ?? row.targetEnd;
  const actualStart = formatCssPercent(actualStartSlot / safeMaxSlot);
  const actualWidth = formatCssPercent(
    Math.max(1, actualEndSlot - actualStartSlot) / safeMaxSlot,
  );
  const release = formatCssPercent(row.releaseSlot / safeMaxSlot);
  const weekCount = Math.max(1, Math.ceil(maxSlot / DAYS_PER_WEEK));

  return el(
    'div',
    {
      className: `gantt-board-row${selected ? ' selected' : ''}`,
      onClick: () => store.commands.selectBook(row.id),
    },
    el(
      'div',
      { className: 'gantt-name-cell' },
      el('strong', { text: row.short }),
      el(
        'div',
        { className: 'muted-copy' },
        `Target ${timelineLabel(row.targetStart)} - ${timelineLabel(row.targetEnd)}`,
      ),
      el(
        'div',
        { className: 'badge-row compact-badge-row' },
        ...rowBadges(row),
      ),
    ),
    el(
      'div',
      { className: 'gantt-timeline-cell' },
      el(
        'div',
        { className: 'gantt-gridlines' },
        ...Array.from({ length: weekCount }, (_, index) => {
          const marker = el('div', { className: 'gantt-week-marker' });
          marker.style.left = formatCssPercent(
            (index * DAYS_PER_WEEK) / safeMaxSlot,
          );
          return marker;
        }),
      ),
      (() => {
        const releaseMarker = el('div', {
          className: 'gantt-release-marker',
          title: `Release ${timelineLabel(row.releaseSlot)}`,
        });
        releaseMarker.style.left = release;
        return releaseMarker;
      })(),
      (() => {
        const baseline = el('div', { className: 'gantt-baseline-fill' });
        baseline.style.left = targetStart;
        baseline.style.width = targetWidth;
        baseline.style.background = color;
        baseline.style.borderColor = color;
        baseline.style.opacity = '0.22';
        return baseline;
      })(),
      (() => {
        const actual = el('div', { className: 'gantt-actual-bar' });
        actual.style.left = actualStart;
        actual.style.width = actualWidth;
        actual.style.background = color;
        return actual;
      })(),
      diagnostics
        ? el(
            'div',
            { className: 'gantt-track-note muted-copy' },
            `Actual ${row.actualStart ?? '—'} → ${row.actualEnd ?? '—'} · boost ${row.boostedDays} day(s)`,
          )
        : null,
    ),
  );
}
