import { describe, expect, it, vi } from 'vitest';

import { createDefaultSourceSettings, EXAMPLE_BOOK } from '../../src/core/defaults';
import {
  choosePreferredDocumentCandidate,
  defaultDocumentAcquisitionPolicy,
} from '../../src/infra/document-acquisition';
import { createQBittorrentProvider } from '../../src/infra/qbittorrent-provider';

describe('qBittorrent search precision', () => {
  it('uses seeders rather than leechers when otherwise comparable torrent candidates compete', () => {
    const policy = { ...defaultDocumentAcquisitionPolicy(), enabled: true };
    const selected = choosePreferredDocumentCandidate([
      {
        id: 'many-leechers',
        provider: 'qbittorrent',
        title: 'Fixture Book many leechers',
        sourceUrl: 'magnet:?xt=urn:btih:leechers',
        contentKind: 'pdf',
        accessBasis: 'open_access',
        confidence: 0.8,
        matchScore: 0.84,
        seeders: 2,
        peers: 200,
      },
      {
        id: 'many-seeders',
        provider: 'qbittorrent',
        title: 'Fixture Book many seeders',
        sourceUrl: 'magnet:?xt=urn:btih:seeders',
        contentKind: 'pdf',
        accessBasis: 'open_access',
        confidence: 0.8,
        matchScore: 0.84,
        seeders: 24,
        peers: 1,
      },
    ], policy);

    expect(selected?.id).toBe('many-seeders');
  });

  it('searches plugins by ISBN first and orders exact results by seeders', async () => {
    const searchStartBodies: URLSearchParams[] = [];
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
            fullName: 'Open Archive',
            name: 'openarchive',
            supportedCategories: [{ id: 'books', name: 'Books' }],
            url: 'https://archive.org',
          },
        ]);
      }
      if (url.endsWith('/api/v2/search/start')) {
        const body = init?.body as URLSearchParams;
        searchStartBodies.push(body);
        return Response.json({ id: 91 });
      }
      if (url.includes('/api/v2/search/results?')) {
        return Response.json({
          status: 'Stopped',
          results: [
            {
              fileName: 'Precise Systems 9781111111111 low seed.pdf',
              fileUrl: 'magnet:?xt=urn:btih:lowseed',
              siteUrl: 'https://archive.org/details/precise-low',
              nbSeeders: 4,
              nbLeechers: 500,
              fileSize: 12_000,
            },
            {
              fileName: 'Precise Systems 9781111111111 high seed.pdf',
              fileUrl: 'magnet:?xt=urn:btih:highseed',
              siteUrl: 'https://archive.org/details/precise-high',
              nbSeeders: 35,
              nbLeechers: 1,
              fileSize: 12_000,
            },
            {
              fileName: 'Precise Systems 9781111111111 dead.pdf',
              fileUrl: 'magnet:?xt=urn:btih:dead',
              siteUrl: 'https://archive.org/details/precise-dead',
              nbSeeders: 0,
              nbLeechers: 100,
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
    sourceSettings.documentSources.qbittorrent = true;
    sourceSettings.qbittorrent = {
      ...sourceSettings.qbittorrent,
      userProvidedTorrents: false,
      searchPlugins: true,
      allowedPlugins: ['openarchive'],
      allowedSites: ['archive.org'],
      categories: ['books'],
      maxResults: 5,
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
        title: 'Precise Systems',
        authors: ['A. Author'],
        isbn: '978-1-111111-11-1',
        sourcePath: null,
      },
      policy: { ...defaultDocumentAcquisitionPolicy(), enabled: true, sourceSettings },
    });

    expect(searchStartBodies).toHaveLength(1);
    expect(searchStartBodies[0]?.get('pattern')).toBe('9781111111111');
    expect(candidates.map((candidate) => candidate.sourceUrl)).toEqual([
      'magnet:?xt=urn:btih:highseed',
      'magnet:?xt=urn:btih:lowseed',
    ]);
  });

  it('runs selected plugins as parallel jobs and pools their seeded results', async () => {
    const searchStartBodies: URLSearchParams[] = [];
    const resultLimits: string[] = [];
    const jobs = new Map<number, { plugin: string; pattern: string }>();
    let nextSearchId = 10;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/v2/auth/login')) {
        return new Response('Ok.', {
          status: 200,
          headers: { 'set-cookie': 'SID=abc; HttpOnly' },
        });
      }
      if (url.endsWith('/api/v2/search/plugins')) {
        return Response.json([
          { enabled: true, fullName: 'Archive', name: 'archive', url: 'https://archive.org' },
          { enabled: true, fullName: 'Standard', name: 'standard', url: 'https://standardebooks.org' },
        ]);
      }
      if (url.endsWith('/api/v2/search/start')) {
        const body = init?.body as URLSearchParams;
        const id = nextSearchId;
        nextSearchId += 1;
        searchStartBodies.push(body);
        jobs.set(id, {
          plugin: String(body.get('plugins')),
          pattern: String(body.get('pattern')),
        });
        return Response.json({ id });
      }
      if (url.includes('/api/v2/search/results?')) {
        const params = new URL(url).searchParams;
        resultLimits.push(params.get('limit') ?? '');
        const job = jobs.get(Number(params.get('id')));
        return Response.json({
          status: 'Stopped',
          results: job?.plugin === 'standard'
            ? [
                {
                  fileName: `${job.pattern} Standard exact.pdf`,
                  fileUrl: 'magnet:?xt=urn:btih:standard',
                  siteUrl: 'https://standardebooks.org/fixture',
                  nbSeeders: 40,
                  nbLeechers: 1,
                  fileSize: 12_000,
                },
              ]
            : [
                {
                  fileName: `${job?.pattern ?? ''} Archive exact.pdf`,
                  fileUrl: 'magnet:?xt=urn:btih:archive',
                  siteUrl: 'https://archive.org/details/fixture',
                  nbSeeders: 6,
                  nbLeechers: 80,
                  fileSize: 12_000,
                },
                {
                  fileName: `${job?.pattern ?? ''} Archive dead.pdf`,
                  fileUrl: 'magnet:?xt=urn:btih:dead',
                  siteUrl: 'https://archive.org/details/dead',
                  nbSeeders: 0,
                  nbLeechers: 400,
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
      allowedPlugins: ['archive', 'standard'],
      allowedSites: ['archive.org', 'standardebooks.org'],
      maxResults: 30,
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
        title: 'Precise Systems',
        authors: ['A. Author'],
        isbn: '9781111111111',
        sourcePath: null,
      },
      policy: { ...defaultDocumentAcquisitionPolicy(), enabled: true, sourceSettings },
    });

    expect(searchStartBodies.map((body) => body.get('plugins')).sort()).toEqual(['archive', 'standard']);
    expect(new Set(searchStartBodies.map((body) => body.get('pattern')))).toEqual(new Set(['9781111111111']));
    expect(resultLimits).toEqual(['30', '30']);
    expect(candidates.map((candidate) => candidate.sourceUrl)).toEqual([
      'magnet:?xt=urn:btih:standard',
      'magnet:?xt=urn:btih:archive',
    ]);
  });
});
