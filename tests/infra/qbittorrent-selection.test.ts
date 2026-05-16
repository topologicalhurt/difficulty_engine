import { describe, expect, it } from 'vitest';

import {
  EXAMPLE_BOOK,
  createDefaultSourceSettings,
} from '../../src/core/defaults';
import { defaultDocumentAcquisitionPolicy } from '../../src/infra/document-acquisition';
import {
  preferredTorrentFile,
  selectTrustedTorrentFile,
  torrentComplete,
} from '../../src/infra/qbittorrent-selection';

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

  it('rejects abbreviated solution PDFs before selecting a textbook file', () => {
    const selected = preferredTorrentFile(
      [
        {
          index: 0,
          name: 'Griffiths D. Introduction to Electrodynamics 4ed 2013 Sol.pdf',
          size: 34_000,
          progress: 1,
        },
        {
          index: 1,
          name: 'Griffiths D. Introduction to Electrodynamics 5ed 2023.pdf',
          size: 14_000,
          progress: 1,
        },
      ],
      {
        book: {
          ...EXAMPLE_BOOK,
          title: 'Introduction to Electrodynamics',
          authors: ['David J. Griffiths'],
        },
        policy: qbitPolicy(),
      },
    );

    expect(selected?.name).toBe(
      'Griffiths D. Introduction to Electrodynamics 5ed 2023.pdf',
    );
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

  it('returns centralized rejection diagnostics for untrusted file sets', () => {
    const selection = selectTrustedTorrentFile(
      [
        {
          index: 0,
          name: 'Fixture Book/Extras/Fixture Book.pdf',
          size: 10_000,
          progress: 1,
        },
      ],
      {
        id: 'candidate',
        provider: 'qbittorrent',
        title: 'Fixture Book',
        sourceUrl: 'magnet:?xt=urn:btih:fixture',
        contentKind: 'pdf',
        accessBasis: 'user_provided',
        confidence: 0.9,
        matchScore: 1,
      },
      {
        book: { ...EXAMPLE_BOOK, title: 'Fixture Book' },
        policy: qbitPolicy(),
      },
    );

    expect(selection.selected).toBeNull();
    expect(selection.rejectionReason).toContain('No eligible top-surface PDF');
    expect(selection.rejectionReason).toContain('nested below');
  });

  it('does not mark metadata-only zero-byte torrents complete from amount_left alone', () => {
    expect(
      torrentComplete({
        state: 'metaDL',
        progress: 0,
        amount_left: 0,
        size: 0,
        total_size: 0,
      }),
    ).toBe(false);
  });
});
