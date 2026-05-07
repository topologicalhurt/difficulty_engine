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
      'document:localOcr',
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

  it('shell-quotes generated qBittorrent commands for unsafe paths', () => {
    const store = projectStore();
    store.commands.updateQbittorrentLocalSettings({
      baseUrl: 'http://127.0.0.1:8123/bridge; echo bad',
      savePath: "output/data/books; echo 'bad'",
    });

    const viewModel = selectProjectViewModel(store.selectors.getState());

    expect(viewModel.qbittorrentLaunchCommand).toContain(
      "--bridge-url 'http://127.0.0.1:8123/bridge; echo bad'",
    );
    expect(viewModel.qbittorrentLaunchCommand).toContain(
      "--data-root 'output/data/books; echo '\\''bad'\\'''",
    );
    expect(viewModel.qbittorrentLaunchCommand).toContain(
      "--allowed-origin 'http://127.0.0.1:*,http://localhost:*'",
    );
  });
});
