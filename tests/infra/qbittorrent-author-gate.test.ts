import { describe, expect, it, vi } from 'vitest';

import {
  EXAMPLE_BOOK,
  createDefaultSourceSettings,
} from '../../src/core/defaults';
import { defaultDocumentAcquisitionPolicy } from '../../src/infra/document-acquisition';
import { createQBittorrentProvider } from '../../src/infra/qbittorrent-provider';

describe('qBittorrent author gate', () => {
  it('rejects similar title-only plugin hits when the author is different', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/api/v2/auth/login')) {
        return new Response('Ok.', {
          status: 200,
          headers: { 'set-cookie': 'SID=abc; HttpOnly' },
        });
      }
      if (url.endsWith('/api/v2/search/plugins')) {
        return Response.json([
          {
            enabled: true,
            fullName: 'Open Archive',
            name: 'openarchive',
            url: 'https://archive.org',
          },
        ]);
      }
      if (url.endsWith('/api/v2/search/start')) {
        return Response.json({ id: 101 });
      }
      if (url.includes('/api/v2/search/results?')) {
        return Response.json({
          status: 'Stopped',
          results: [
            {
              fileName: 'Signals and Systems Wrongauthor.pdf',
              fileUrl: 'magnet:?xt=urn:btih:wrongauthor',
              siteUrl: 'https://archive.org/details/wrong-author',
              accessBasis: 'open_access',
              nbSeeders: 50,
              nbLeechers: 1,
              fileSize: 12_000,
            },
            {
              fileName: 'Signals and Systems Oppenheim.pdf',
              fileUrl: 'magnet:?xt=urn:btih:oppenheim',
              siteUrl: 'https://archive.org/details/oppenheim',
              accessBasis: 'open_access',
              nbSeeders: 12,
              nbLeechers: 1,
              fileSize: 12_000,
            },
          ],
        });
      }
      if (url.endsWith('/api/v2/search/delete')) {
        return new Response('Ok.', { status: 200 });
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    const sourceSettings = createDefaultSourceSettings();
    sourceSettings.qbittorrent = {
      ...sourceSettings.qbittorrent,
      userProvidedTorrents: false,
      allowedPlugins: ['openarchive'],
      allowedSites: ['archive.org'],
      maxResults: 10,
    };
    const provider = createQBittorrentProvider({
      baseUrl: 'http://127.0.0.1:8787',
      username: 'user',
      password: 'pass',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const candidates = await provider.findCandidates({
      book: {
        ...EXAMPLE_BOOK,
        title: 'Signals and Systems',
        authors: ['Alan Oppenheim'],
        sourcePath: null,
      },
      policy: {
        ...defaultDocumentAcquisitionPolicy(),
        enabled: true,
        sourceSettings,
      },
    });

    expect(candidates.map((candidate) => candidate.sourceUrl)).toEqual([
      'magnet:?xt=urn:btih:oppenheim',
    ]);
  });
});
