import { describe, expect, it, vi } from 'vitest';

import {
  EXAMPLE_BOOK,
  createDefaultSourceSettings,
} from '../../src/core/defaults';
import type { SourceSettings } from '../../src/core/types';
import { defaultDocumentAcquisitionPolicy } from '../../src/infra/document-acquisition';
import { createQBittorrentProvider } from '../../src/infra/qbittorrent-provider';

function qbitPolicy(
  patch: { sourceSettings?: SourceSettings } = {},
): ReturnType<typeof defaultDocumentAcquisitionPolicy> {
  const sourceSettings = createDefaultSourceSettings();
  sourceSettings.documentSources.qbittorrent = true;
  sourceSettings.qbittorrent.searchPlugins = false;
  return {
    ...defaultDocumentAcquisitionPolicy(),
    enabled: true,
    sourceSettings,
    ...patch,
  };
}

describe('qBittorrent local acquisition', () => {
  it('marks completed qBittorrent metadata failed when the file is missing', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/api/v2/auth/login')) {
        return new Response('Ok.', {
          status: 200,
          headers: { 'set-cookie': 'SID=abc; HttpOnly' },
        });
      }
      if (url.endsWith('/api/v2/torrents/info')) {
        return Response.json([
          {
            hash: 'abc123',
            name: 'Fixture Book Author Name',
            state: 'stalledUP',
            progress: 1,
          },
        ]);
      }
      if (url.includes('/api/v2/torrents/files?')) {
        return Response.json([
          {
            index: 0,
            name: 'Fixture Book Author Name.pdf',
            size: 10_000,
            progress: 1,
          },
        ]);
      }
      if (url.endsWith('/api/v2/torrents/filePrio')) {
        return new Response('Ok.', { status: 200 });
      }
      if (
        url.endsWith('/api/v2/torrents/start') ||
        url.endsWith('/api/v2/torrents/resume')
      ) {
        return new Response('Ok.', { status: 200 });
      }
      if (url.includes('/documents/read-bytes?')) {
        return new Response('missing', { status: 404 });
      }
      if (url.includes('/documents/status?')) {
        return new Response('missing', { status: 404 });
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    const provider = createQBittorrentProvider({
      baseUrl: 'http://127.0.0.1:8787',
      username: 'user',
      password: 'pass',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      savePath: '/tmp/difficulty',
    });
    const candidate = {
      id: 'manual',
      provider: 'qbittorrent',
      title: 'Fixture Book Author Name',
      sourceUrl: 'magnet:?xt=urn:btih:abc123',
      contentKind: 'pdf' as const,
      accessBasis: 'user_provided' as const,
      confidence: 0.9,
      matchScore: 1,
    };

    const acquired = await provider.acquire(candidate, {
      book: {
        ...EXAMPLE_BOOK,
        title: 'Fixture Book',
        authors: ['Author Name'],
        sourcePath: null,
      },
      policy: qbitPolicy(),
    });

    expect(acquired?.documentRef?.status).toBe('failed');
    expect(acquired?.documentRef?.availability.reason).toContain('missing');
  });

  it('uses bridge data root but waits for qBittorrent tracking before creating refs', async () => {
    const addSavePaths: Array<string | null> = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/__health')) {
        return Response.json({
          ok: true,
          dataRoot: '/absolute/data/documents',
        });
      }
      if (url.endsWith('/api/v2/auth/login')) {
        return new Response('Ok.', {
          status: 200,
          headers: { 'set-cookie': 'SID=abc; HttpOnly' },
        });
      }
      if (url.endsWith('/api/v2/torrents/info')) return Response.json([]);
      if (url.endsWith('/api/v2/torrents/add')) {
        const body = init?.body as FormData;
        addSavePaths.push(String(body.get('savepath')));
        return new Response('Ok.', { status: 200 });
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    const provider = createQBittorrentProvider({
      baseUrl: 'http://127.0.0.1:8787',
      username: 'user',
      password: 'pass',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      savePath: 'output/data/documents',
    });
    const candidate = {
      id: 'manual',
      provider: 'qbittorrent',
      title: 'Fixture Book',
      sourceUrl: 'magnet:?xt=urn:btih:abc123',
      contentKind: 'pdf' as const,
      accessBasis: 'user_provided' as const,
      confidence: 0.9,
      matchScore: 1,
    };

    const acquired = await provider.acquire(candidate, {
      book: { ...EXAMPLE_BOOK, title: 'Fixture Book', sourcePath: null },
      policy: qbitPolicy(),
    });

    expect(addSavePaths).toEqual(['/absolute/data/documents']);
    expect(acquired).toBeNull();
  });

  it('reuses already tracked difficulty-engine torrents as find candidates', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/api/v2/auth/login')) {
        return new Response('Ok.', {
          status: 200,
          headers: { 'set-cookie': 'SID=abc; HttpOnly' },
        });
      }
      if (url.endsWith('/api/v2/torrents/info')) {
        return Response.json([
          {
            category: '',
            hash: 'uncategorized',
            name: 'Fixture Book by Author Name',
            content_path: '/repo/output/data/documents/Fixture Book Author Name.pdf',
            magnet_uri: 'magnet:?xt=urn:btih:uncategorized',
            num_seeds: 9,
            num_leechs: 0,
            progress: 1,
            state: 'stalledUP',
          },
          {
            category: 'difficulty-engine',
            hash: 'abc123',
            name: 'Fixture Book by Author Name',
            content_path: '/repo/output/data/documents/Fixture Book Author Name.pdf',
            magnet_uri: 'magnet:?xt=urn:btih:abc123',
            num_seeds: 0,
            num_leechs: 0,
            progress: 1,
            state: 'stalledUP',
          },
        ]);
      }
      if (url.endsWith('/api/v2/search/plugins')) {
        return Response.json([]);
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    const sourceSettings = createDefaultSourceSettings();
    sourceSettings.qbittorrent = {
      ...sourceSettings.qbittorrent,
      userProvidedTorrents: false,
      searchPlugins: false,
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
        title: 'Fixture Book',
        authors: ['Author Name'],
        sourcePath: null,
      },
      policy: {
        ...defaultDocumentAcquisitionPolicy(),
        enabled: true,
        sourceSettings,
      },
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        sourceUrl: 'magnet:?xt=urn:btih:abc123',
        accessBasis: 'user_owned',
      }),
    ]);
  });
});
