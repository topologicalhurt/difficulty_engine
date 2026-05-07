// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderPlanBookJump } from '../../src/ui/plan-book-jump';
import { renderPlanView } from '../../src/ui/plan-view';
import { makeStore } from '../app/store-test-utils';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('plan view', () => {
  it('renders persisted Gantt and calendar collapsed states', () => {
    const store = makeStore();
    store.commands.setPlanSectionOpen('gantt', false);
    store.commands.setPlanSectionOpen('calendar', false);

    const view = renderPlanView(store.selectors.getState(), store);

    expect(view.textContent).toContain('Gantt timeline');
    expect(view.textContent).toContain('Study calendar');
    expect(view.querySelectorAll('.collapsible-card.open')).toHaveLength(0);
  });

  it('shows selected calendar logging before other side-panel content', () => {
    const store = makeStore();
    const snapshot = store.selectors.getSnapshot();
    const firstDate = Object.keys(snapshot.dayPlan.byDate).sort()[0];
    const firstEntry = snapshot.dayPlan.byDate[firstDate]?.[0];
    if (!firstEntry) throw new Error('Expected a calendar entry.');

    store.commands.selectCalendarEntry(firstDate, firstEntry.bookId);
    const view = renderPlanView(store.selectors.getState(), store);
    const sidePanel = view.querySelector('.planner-side-column');

    expect(sidePanel?.firstElementChild?.textContent).toContain('Log progress');
  });

  it('wires Plan jump controls to book selection', () => {
    const store = makeStore();
    const view = renderPlanView(store.selectors.getState(), store);
    const jump = view.querySelector('.plan-jump-select');
    if (!(jump instanceof HTMLSelectElement)) {
      throw new Error('Expected a Plan jump select.');
    }

    jump.value = 'book-1';
    jump.dispatchEvent(new Event('change'));

    expect(store.selectors.getState().ui.selectedBookId).toBe('book-1');
    expect(view.querySelector('[data-plan-gantt-book-id="book-1"]')).toBeTruthy();
  });

  it('scopes Plan jump scrolling to the current planner root', () => {
    const store = makeStore();
    const scrolled: Element[] = [];
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value(this: Element): void {
        scrolled.push(this);
      },
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const firstRoot = document.createElement('div');
    firstRoot.className = 'difficulty-engine-app';
    const firstTarget = document.createElement('div');
    firstTarget.dataset.planGanttBookId = 'book-1';
    firstRoot.append(firstTarget);
    const secondRoot = document.createElement('div');
    secondRoot.className = 'difficulty-engine-app';
    const secondTarget = document.createElement('div');
    secondTarget.dataset.planGanttBookId = 'book-1';
    const jump = renderPlanBookJump(
      [{ id: 'book-1', label: 'Book 1' }],
      null,
      'gantt',
      store,
    );
    secondRoot.append(jump, secondTarget);
    document.body.append(firstRoot, secondRoot);

    const select = jump.querySelector('.plan-jump-select');
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('Expected jump select.');
    }
    select.value = 'book-1';
    select.dispatchEvent(new Event('change'));

    expect(scrolled).toEqual([secondTarget]);
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: originalScrollIntoView,
    });
  });
});
