// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

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
});
