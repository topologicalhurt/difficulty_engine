import { describe, expect, it, vi } from 'vitest';

import {
  createDefaultSourceSettings,
  EXAMPLE_BOOK,
} from '../../src/core/defaults';
import { defaultDocumentAcquisitionPolicy } from '../../src/infra/document-acquisition';
import {
  createQBittorrentIntegrationService,
  createQBittorrentProvider,
} from '../../src/infra/qbittorrent-provider';

describe('qBittorrent search hit-rate diagnostics', () => {
  it('surfaces unknown-license hits as blocked diagnostics', async () => {
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
            fullName: 'Allowed Plugin',
            name: 'allowed',
            url: 'https://archive.org',
          },
        ]);
      }
      if (url.endsWith('/api/v2/search/start')) {
        return Response.json({ id: 92 });
      }
      if (url.includes('/api/v2/search/results?')) {
        return Response.json({
          status: 'Stopped',
          results: [
            {
              fileName: 'Precise Systems A Author.pdf',
              fileUrl: 'magnet:?xt=urn:btih:unknownlicense',
              siteUrl: 'https://archive.org/details/unknown-license',
              nbSeeders: 50,
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
      searchPlugins: true,
      allowedPlugins: ['allowed'],
      allowedSites: ['archive.org'],
      requireKnownAccessBasis: true,
    };
    const service = createQBittorrentIntegrationService(
      fetchImpl as unknown as typeof fetch,
    );

    const result = await service.findDocumentCandidates(
      {
        enabled: true,
        baseUrl: 'http://127.0.0.1:8787',
        username: 'user',
        password: 'pass',
        savePath: 'output/data/documents',
        category: 'difficulty-engine',
        timeoutMs: 10000,
      },
      {
        book: {
          ...EXAMPLE_BOOK,
          title: 'Precise Systems',
          authors: ['A Author'],
          isbn: null,
          sourcePath: null,
        },
        sourceSettings,
      },
    );

    expect(result.candidates).toEqual([]);
    expect(result.blockedCandidates[0]?.blockedReasons).toContain(
      'unknown access basis',
    );
    expect(result.blockedCandidates[0]?.retryableAsUserOwned).toBe(true);
    expect(result.searchAttempts[0]).toEqual(
      expect.objectContaining({
        provider: 'qbittorrent',
        blockedCount: 1,
        acceptedCount: 0,
      }),
    );
  });

  it('keeps seeded broad-title hits when noisy exact searches are sparse', async () => {
    const searchStartBodies: URLSearchParams[] = [];
    const jobPatterns = new Map<number, string>();
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
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
            fullName: 'Archive',
            name: 'archive',
            url: 'https://archive.org',
          },
        ]);
      }
      if (url.endsWith('/api/v2/search/start')) {
        const body = init?.body as URLSearchParams;
        const id = searchStartBodies.length + 1;
        searchStartBodies.push(body);
        jobPatterns.set(id, String(body.get('pattern')));
        return Response.json({ id });
      }
      if (url.includes('/api/v2/search/results?')) {
        const pattern = jobPatterns.get(
          Number(new URL(url).searchParams.get('id')),
        );
        return Response.json({
          status: 'Stopped',
          results:
            pattern === 'discrete time signal processing'
              ? [
                  {
                    fileName:
                      'Oppenheim Schafer Discrete-Time Signal Processing 2ed.pdf',
                    fileUrl: 'magnet:?xt=urn:btih:oppenheim',
                    siteUrl: 'https://archive.org/details/oppenheim',
                    accessBasis: 'open_access',
                    nbSeeders: 8,
                    nbLeechers: 1,
                    fileSize: 12_000,
                  },
                ]
              : [],
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
      searchPlugins: true,
      allowedPlugins: ['archive'],
      allowedSites: ['archive.org'],
      requireKnownAccessBasis: true,
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
        title: 'Discrete-time Signal Processing, 2nd, Second Edition',
        short: 'Discrete-time Signal Processing',
        authors: ['Ronald W. Oppenheim Alan V. / Schafer'],
        isbn: null,
        sourcePath: null,
      },
      policy: {
        ...defaultDocumentAcquisitionPolicy(),
        enabled: true,
        sourceSettings,
      },
    });

    expect(searchStartBodies.map((body) => body.get('pattern'))).toContain(
      'discrete time signal processing',
    );
    expect(candidates.map((candidate) => candidate.sourceUrl)).toEqual([
      'magnet:?xt=urn:btih:oppenheim',
    ]);
  });
});
