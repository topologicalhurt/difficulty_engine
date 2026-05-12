import { describe, expect, it } from 'vitest';

import {
  EXAMPLE_BOOK,
  createDefaultSourceSettings,
} from '../../src/core/defaults';
import { defaultDocumentAcquisitionPolicy } from '../../src/infra/document-acquisition';
import { preferredTorrentFile } from '../../src/infra/qbittorrent-selection';

function qbitPolicy(): ReturnType<typeof defaultDocumentAcquisitionPolicy> {
  const sourceSettings = createDefaultSourceSettings();
  sourceSettings.documentSources.qbittorrent = true;
  sourceSettings.qbittorrent.searchPlugins = false;
  return {
    ...defaultDocumentAcquisitionPolicy(),
    enabled: true,
    sourceSettings,
  };
}

describe('qBittorrent file selection', () => {
  it('selects only top-surface PDFs even when matching text is present', () => {
    const selected = preferredTorrentFile(
      [
        {
          index: 0,
          name: 'Fixture Book Exact Edition.pdf',
          size: 10_000,
          progress: 1,
        },
        {
          index: 1,
          name: 'Fixture Book Exact Edition extracted text.txt',
          size: 3_000,
          progress: 0.4,
        },
      ],
      {
        book: { ...EXAMPLE_BOOK, title: 'Fixture Book Exact Edition' },
        policy: qbitPolicy(),
      },
    );

    expect(selected?.name).toBe('Fixture Book Exact Edition.pdf');
  });

  it('does not let weak preferred-kind files outrank a strong PDF match', () => {
    const selected = preferredTorrentFile(
      [
        {
          index: 0,
          name: 'Linear Algebra Done Right 4th Edition.pdf',
          size: 10_000,
          progress: 1,
        },
        {
          index: 1,
          name: 'Unrelated Topology Notes.txt',
          size: 3_000,
          progress: 1,
        },
      ],
      {
        book: { ...EXAMPLE_BOOK, title: 'Linear Algebra Done Right' },
        policy: qbitPolicy(),
      },
    );

    expect(selected?.name).toBe('Linear Algebra Done Right 4th Edition.pdf');
  });

  it('rejects nested PDFs below the first folder level', () => {
    const selected = preferredTorrentFile(
      [
        {
          index: 0,
          name: 'Fixture Book/Extras/Fixture Book.pdf',
          size: 10_000,
          progress: 1,
        },
        {
          index: 1,
          name: 'Fixture Book/Fixture Book.pdf',
          size: 10_000,
          progress: 1,
        },
      ],
      {
        book: { ...EXAMPLE_BOOK, title: 'Fixture Book' },
        policy: qbitPolicy(),
      },
    );

    expect(selected?.name).toBe('Fixture Book/Fixture Book.pdf');
  });
});
