import { describe, expect, it, vi } from 'vitest';

import {
  createDefaultSourceSettings,
  EXAMPLE_BOOK,
} from '../../src/core/defaults';
import { createQBittorrentIntegrationService } from '../../src/infra/qbittorrent-provider';

describe('qBittorrent search policy gates', () => {
  it('requires author evidence for short generic exact subject titles', async () => {
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
            fullName: 'Archive',
            name: 'archive',
            url: 'https://archive.org',
          },
        ]);
      }
      if (url.endsWith('/api/v2/search/start')) {
        return Response.json({ id: 80 });
      }
      if (url.includes('/api/v2/search/results?')) {
        return Response.json({
          status: 'Stopped',
          results: [
            {
              fileName: 'Complex Analysis.pdf',
              fileUrl: 'magnet:?xt=urn:btih:genericanalysis',
              siteUrl: 'https://archive.org/details/genericanalysis',
              accessBasis: 'open_access',
              nbSeeders: 20,
              nbLeechers: 2,
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
      allowedPlugins: ['archive'],
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
          title: 'Complex Analysis',
          authors: ['Elias Stein'],
          isbn: null,
          sourcePath: null,
        },
        sourceSettings,
      },
    );

    expect(result.candidates).toEqual([]);
    expect(result.blockedCandidates[0]?.blockedReasons).toContain(
      'author mismatch',
    );
  });

  it('blocks solver bundles and dedupes repeated blocked search rows', async () => {
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
              fileName: 'Oppenheim Discrete Time Signal Processing Book+solver.pdf',
              fileUrl: 'magnet:?xt=urn:btih:solverbundle',
              siteUrl: 'https://archive.org/details/solverbundle',
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
          title: 'Discrete-time Signal Processing',
          authors: ['Oppenheim'],
          isbn: null,
          sourcePath: null,
        },
        sourceSettings,
      },
    );

    expect(result.candidates).toEqual([]);
    expect(result.blockedCandidates).toHaveLength(1);
    expect(result.blockedCandidates[0]?.blockedReasons).toContain(
      'solution/manual/sample file',
    );
  });

  it('blocks supplement-only x-chapter search rows for main textbook acquisition', async () => {
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
        return Response.json({ id: 95 });
      }
      if (url.includes('/api/v2/search/results?')) {
        return Response.json({
          status: 'Stopped',
          results: [
            {
              fileName: 'Horowitz P. The Art of Electronics. The x-Chapters 2020',
              fileUrl: 'magnet:?xt=urn:btih:xchapters',
              siteUrl: 'https://archive.org/details/xchapters',
              accessBasis: 'open_access',
              nbSeeders: 19,
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
          title: 'The Art of Electronics',
          authors: ['Paul Horowitz', 'Winfield Hill'],
          isbn: null,
          sourcePath: null,
        },
        sourceSettings,
      },
    );

    expect(result.candidates).toEqual([]);
    expect(result.blockedCandidates[0]?.blockedReasons).toContain(
      'solution/manual/sample file',
    );
  });

  it('blocks search rows that explicitly advertise only non-PDF ebook formats', async () => {
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
        return Response.json({ id: 93 });
      }
      if (url.includes('/api/v2/search/results?')) {
        return Response.json({
          status: 'Stopped',
          results: [
            {
              fileName: 'Douglas Self - Small Signal Audio Design (mobi, epub)',
              fileUrl: 'magnet:?xt=urn:btih:ebookonly',
              siteUrl: 'https://archive.org/details/ebookonly',
              accessBasis: 'open_access',
              nbSeeders: 8,
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
          title: 'Small Signal Audio Design',
          authors: ['Douglas Self'],
          isbn: null,
          sourcePath: null,
        },
        sourceSettings,
      },
    );

    expect(result.candidates).toEqual([]);
    expect(result.blockedCandidates[0]?.blockedReasons).toContain(
      'qBittorrent document acquisition requires PDF files',
    );
  });

  it('blocks description-page search results that qBittorrent cannot add directly', async () => {
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
        return Response.json({ id: 94 });
      }
      if (url.includes('/api/v2/search/results?')) {
        return Response.json({
          status: 'Stopped',
          results: [
            {
              fileName: 'Douglas Self - Small Signal Audio Design.pdf',
              fileUrl:
                'https://archive.org/details/small-signal-audio-design',
              siteUrl: 'https://archive.org/details/small-signal-audio-design',
              accessBasis: 'open_access',
              nbSeeders: 18,
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
          title: 'Small Signal Audio Design',
          authors: ['Douglas Self'],
          isbn: null,
          sourcePath: null,
        },
        sourceSettings,
      },
    );

    expect(result.candidates).toEqual([]);
    expect(result.blockedCandidates[0]?.blockedReasons).toContain(
      'missing direct magnet or HTTPS .torrent URL',
    );
  });
});
