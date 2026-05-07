import { describe, expect, it } from 'vitest';

import {
  selectRenderableActiveView,
  selectShellViewModel,
} from '../../src/app/selectors/shell';
import { makeStore } from './store-test-utils';

describe('shell view model', () => {
  it('hides diagnostics in normal UI mode', () => {
    const store = makeStore();

    const viewModel = selectShellViewModel(store.selectors.getState());

    expect(viewModel.tabs.map((tab) => tab.id)).not.toContain('diagnostics');
    expect(viewModel.tabs.map((tab) => tab.label)).toContain('Guide');
    expect(viewModel.tabs.map((tab) => tab.label)).toContain(
      'AI Suggestions',
    );
  });

  it('shows diagnostics in debug UI mode', () => {
    const store = makeStore({ debugUi: true });

    const viewModel = selectShellViewModel(store.selectors.getState());

    expect(viewModel.tabs.map((tab) => tab.id)).toContain('diagnostics');
  });

  it('falls back to plan when diagnostics is hidden', () => {
    const store = makeStore();
    store.commands.setActiveView('diagnostics');

    expect(selectRenderableActiveView(store.selectors.getState())).toBe('plan');
  });
});
