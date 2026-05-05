import { describe, expect, it } from 'vitest';

import { selectProjectViewModel } from '../../src/app/selectors/project';
import { createDefaultSourceSettings } from '../../src/core/defaults';
import { makeBook, makeProject, makeStore } from './store-test-utils';

function projectStore() {
  const sourceSettings = createDefaultSourceSettings();
  sourceSettings.metadataSources.openlibrary = false;
  sourceSettings.documentSources.qbittorrent = false;
  return makeStore({
    initialProject: makeProject({
      books: { example: makeBook({ id: 'example' }) },
      sourceSettings,
    }),
  });
}

describe('project view model', () => {
  it('projects source providers as data-driven rows', () => {
    const store = projectStore();

    const viewModel = selectProjectViewModel(store.selectors.getState());

    expect(
      viewModel.sourceProviders.map((row) => `${row.kind}:${row.key}`),
    ).toEqual([
      'metadata:openlibrary',
      'metadata:googleBooks',
      'metadata:internetArchive',
      'document:directUrl',
      'document:localFile',
      'document:internetArchiveText',
      'document:qbittorrent',
    ]);
    expect(
      viewModel.sourceProviders.find((row) => row.key === 'openlibrary')
        ?.checked,
    ).toBe(false);
    expect(
      viewModel.sourceProviders.find((row) => row.key === 'qbittorrent')
        ?.checked,
    ).toBe(false);
    expect(viewModel.contentPreferenceLabel).toBe(
      'text -> epub -> ocr_text -> pdf',
    );
  });
});
