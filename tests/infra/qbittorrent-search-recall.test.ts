import { describe, expect, it, vi } from 'vitest';

import {
  createDefaultSourceSettings,
  EXAMPLE_BOOK,
} from '../../src/core/defaults';
import { defaultDocumentAcquisitionPolicy } from '../../src/infra/document-acquisition';
import { createQBittorrentProvider } from '../../src/infra/qbittorrent-provider';

describe('qBittorrent recall search ranking', () => {
  it('prefers a high-availability subtitle hit over a stale exact-looking hit', async () => {
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
        const id = jobPatterns.size + 1;
        jobPatterns.set(
          id,
          String((init?.body as URLSearchParams).get('pattern')),
        );
        return Response.json({ id });
      }
      if (url.includes('/api/v2/search/results?')) {
        const pattern = jobPatterns.get(
          Number(new URL(url).searchParams.get('id')),
        );
        return Response.json({
          status: 'Stopped',
          results:
            pattern === 'calculus an intuitive and physical approach'
              ? [
                  {
                    fileName:
                      'Kline M. Calculus. An Intuitive and Physical Approach 2ed 1998.pdf',
                    fileUrl: 'magnet:?xt=urn:btih:staleKline',
                    siteUrl: 'https://archive.org/details/stale-kline',
                    accessBasis: 'open_access',
                    nbSeeders: 2,
                    nbLeechers: 0,
                    fileSize: 12_000,
                  },
                ]
              : pattern === 'an intuitive and physical approach'
                ? [
                    {
                      fileName:
                        'Morris Kline Calculus An Intuitive and Physical Approach.pdf',
                      fileUrl: 'magnet:?xt=urn:btih:healthyKline',
                      siteUrl: 'https://archive.org/details/healthy-kline',
                      accessBasis: 'open_access',
                      nbSeeders: 53,
                      nbLeechers: 3,
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
        title: 'Kline M. Calculus. An Intuitive and Physical Approach 2ed 1998',
        short: 'Calculus',
        authors: ['Morris Kline'],
        isbn: null,
        sourcePath: null,
      },
      policy: {
        ...defaultDocumentAcquisitionPolicy(),
        enabled: true,
        sourceSettings,
      },
    });

    expect([...jobPatterns.values()]).toContain(
      'an intuitive and physical approach',
    );
    expect(candidates[0]?.sourceUrl).toBe('magnet:?xt=urn:btih:healthyKline');
    expect(candidates[0]?.searchAvailability?.seeders).toBe(53);
    expect(candidates[0]?.availabilitySource).toBe('search_result');
  });
});
