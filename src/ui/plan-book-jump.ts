import type { PlanViewModel } from '../app/selectors/plan';
import type { PlannerStore } from '../core/types';
import { el } from './dom';
import { selectInput } from './form-controls';

type PlanJumpTarget = 'gantt' | 'calendar';

function scrollToBook(
  root: ParentNode,
  target: PlanJumpTarget,
  bookId: string,
): void {
  const datasetKey =
    target === 'gantt' ? 'planGanttBookId' : 'planCalendarBookId';
  const attribute =
    target === 'gantt' ? 'data-plan-gantt-book-id' : 'data-plan-calendar-book-id';
  const scroll = (): void => {
    const match = Array.from(root.querySelectorAll<HTMLElement>(`[${attribute}]`))
      .find((node) => node.dataset[datasetKey] === bookId);
    if (typeof match?.scrollIntoView === 'function') {
      match.scrollIntoView({ block: 'center', inline: 'center' });
    }
  };
  if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(scroll);
    return;
  }
  globalThis.setTimeout(scroll, 0);
}

export function renderPlanBookJump(
  options: PlanViewModel['bookJumpOptions'],
  selectedBookId: string | null,
  target: PlanJumpTarget,
  store: PlannerStore,
): HTMLElement {
  const select = selectInput(
    selectedBookId ?? '',
    [
      { value: '', label: 'Choose book...' },
      ...options.map((option) => ({
        value: option.id,
        label: option.label,
      })),
    ],
    {
      className: 'select-input plan-jump-select',
      ariaLabel: `Jump to book in ${target}`,
      onChange: (event) => {
        const input = event.currentTarget as HTMLSelectElement;
        const bookId = input.value;
        if (!bookId) return;
        store.commands.selectBook(bookId);
        scrollToBook(
          input.closest('.difficulty-engine-app') ?? document,
          target,
          bookId,
        );
      },
    },
  );
  return el(
    'label',
    { className: 'inline-control muted-copy plan-jump-control' },
    el('span', { text: 'Find book' }),
    select,
  );
}
