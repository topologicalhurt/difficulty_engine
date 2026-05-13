// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { renderProjectView } from '../../src/ui/project-view';
import { makeBook, makeProject, makeStore } from '../app/store-test-utils';

describe('project view', () => {
  it('renders global metadata cleanup without exposing local credentials', () => {
    const store = makeStore();
    const view = renderProjectView(store.selectors.getState(), store);
    const text = view.textContent ?? '';

    expect(text).toContain('Project metadata maintenance');
    expect(text).toContain('Delete all metadata');
    expect(text).toContain('Also delete downloaded PDFs/content');
    expect(text).toContain('qBittorrent connection details are local-only');
  });

  it('preserves partial autopilot book reference text while typing', () => {
    const store = makeStore({
      initialProject: makeProject({
        books: {
          a: makeBook({ id: 'a', title: 'Abstract Algebra' }),
        },
      }),
    });
    const view = renderProjectView(store.selectors.getState(), store);
    const input = view.querySelector<HTMLInputElement>(
      '[data-focus-key="autopilot-scary-books"]',
    );
    expect(input).not.toBeNull();

    input!.value = 'Abs';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    const rerendered = renderProjectView(store.selectors.getState(), store);
    const rerenderedInput = rerendered.querySelector<HTMLInputElement>(
      '[data-focus-key="autopilot-scary-books"]',
    );

    expect(rerenderedInput?.value).toBe('Abs');
    expect(store.selectors.getState().ui.autopilotDraft.scaryBookIds).toEqual(
      [],
    );
  });
});
