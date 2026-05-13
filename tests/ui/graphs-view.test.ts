// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { renderInteractiveGraphCard } from '../../src/ui/graph-viewport';
import { renderGraphsView } from '../../src/ui/graphs-view';
import { makeStore } from '../app/store-test-utils';

describe('graphs view', () => {
  it('keeps graph settings disclosure state in the store', () => {
    const store = makeStore();
    const view = renderGraphsView(store.selectors.getState(), store);
    const details = view.querySelector('details');
    if (!(details instanceof HTMLDetailsElement)) {
      throw new Error('Expected graph settings details element.');
    }

    details.open = true;
    details.dispatchEvent(new Event('toggle'));

    expect(store.selectors.getState().ui.graphOptionsOpen).toBe(true);
    const rerendered = renderGraphsView(store.selectors.getState(), store);
    expect(rerendered.querySelector('details')?.open).toBe(true);
  });

  it('uses the shared panel collapse state for interactive graph cards', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const first = renderInteractiveGraphCard(
      'fixture-graph',
      'Fixture Graph',
      'Drag to pan.',
      svg,
    );
    const toggle = first.querySelector('.panel-toggle-button');
    if (!(toggle instanceof HTMLButtonElement)) {
      throw new Error('Expected graph panel toggle.');
    }

    toggle.click();

    expect(first.querySelector('.card-body')?.hasAttribute('hidden')).toBe(
      true,
    );
    expect((first.querySelector('.card-body') as HTMLElement | null)?.style.display)
      .toBe('none');
    expect(first.dataset.collapsed).toBe('true');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    const second = renderInteractiveGraphCard(
      'fixture-graph',
      'Fixture Graph',
      'Drag to pan.',
      document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
    );
    expect(second.dataset.panelId).toBe('graph:fixture-graph');
    expect(second.querySelector('.card-body')?.hasAttribute('hidden')).toBe(
      true,
    );
    expect((second.querySelector('.card-body') as HTMLElement | null)?.style.display)
      .toBe('none');
  });
});
