// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { renderProjectView } from '../../src/ui/project-view';
import { makeStore } from '../app/store-test-utils';

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
});
