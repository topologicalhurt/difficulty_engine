// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { renderActiveTabBody } from '../../src/ui/active-tab-host';
import { makeStore } from '../app/store-test-utils';

describe('active tab rendering', () => {
  it('does not rebuild the active tab for unrelated UI updates', () => {
    const store = makeStore();
    const root = document.createElement('section');

    renderActiveTabBody(root, store.selectors.getState(), store);
    const initialBody = root.firstElementChild;
    store.commands.setBanner({ tone: 'info', message: 'Saved' });
    renderActiveTabBody(root, store.selectors.getState(), store);

    expect(root.firstElementChild).toBe(initialBody);
  });

  it('rebuilds when active tab dependencies change', () => {
    const store = makeStore();
    const root = document.createElement('section');

    renderActiveTabBody(root, store.selectors.getState(), store);
    const initialBody = root.firstElementChild;
    store.commands.selectBook('book-1');
    renderActiveTabBody(root, store.selectors.getState(), store);

    expect(root.firstElementChild).not.toBe(initialBody);
  });

  it('does not render diagnostics when debug UI is disabled', () => {
    const store = makeStore();
    const root = document.createElement('section');

    store.commands.setActiveView('diagnostics');
    renderActiveTabBody(root, store.selectors.getState(), store);

    expect(root.dataset.activeView).toBe('plan');
    expect(root.textContent).toContain('Quick add');
  });

  it('rebuilds the project tab when an autopilot proposal is generated', () => {
    const store = makeStore();
    const root = document.createElement('section');

    store.commands.setActiveView('project');
    renderActiveTabBody(root, store.selectors.getState(), store);
    expect(root.textContent).not.toContain('Apply proposal');

    store.commands.solveProjectForMe();
    renderActiveTabBody(root, store.selectors.getState(), store);

    expect(root.textContent).toContain('Apply proposal');
    expect(root.textContent).toContain('Confidence-first autopilot');
  });
});
