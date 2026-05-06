import { describe, expect, it, vi } from 'vitest';

import {
  EXAMPLE_BOOK,
  createDefaultSourceSettings,
} from '../../src/core/defaults';
import type { SourceSettings } from '../../src/core/types';
import { defaultDocumentAcquisitionPolicy } from '../../src/infra/document-acquisition';
import { createQBittorrentProvider } from '../../src/infra/qbittorrent-provider';
import { preferredTorrentFile } from '../../src/infra/qbittorrent-selection';

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

describe('qBittorrent document provider', () => {
  it('selects text before an exact-match PDF inside the same torrent', () => {
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
          name: 'Fixture Book extracted text.txt',
          size: 3_000,
          progress: 0.4,
        },
      ],
      {
        book: { ...EXAMPLE_BOOK, title: 'Fixture Book Exact Edition' },
        policy: qbitPolicy(),
      },
    );

    expect(selected?.name).toBe('Fixture Book extracted text.txt');
  });

  it('does not call qBittorrent when the source mask disables it', async () => {
    const fetchImpl = vi.fn();
    const provider = createQBittorrentProvider({
      baseUrl: 'http://127.0.0.1:8080',
      username: 'user',
      password: 'pass',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const sourceSettings = createDefaultSourceSettings();
    sourceSettings.documentSources.qbittorrent = false;
    const book = {
      ...EXAMPLE_BOOK,
      title: 'Fixture Book',
      sourcePath: 'magnet:?xt=urn:btih:fixture',
    };

    const candidates = await provider.findCandidates({
      book,
      policy: {
        ...defaultDocumentAcquisitionPolicy(),
        enabled: true,
        sourceSettings,
      },
    });

    expect(candidates).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('does not treat imported local torrent file paths as browser-addable torrent sources', async () => {
    const fetchImpl = vi.fn();
    const provider = createQBittorrentProvider({
      baseUrl: 'http://127.0.0.1:8080',
      username: 'user',
      password: 'pass',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const candidates = await provider.findCandidates({
      book: {
        ...EXAMPLE_BOOK,
        title: 'Fixture Book',
        sourcePath: '/Users/connor/private/book.torrent',
      },
      policy: qbitPolicy(),
    });

    expect(candidates).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses the Web API without accepting unlicensed torrent candidates', async () => {
    const priorityCalls: string[] = [];
    let addCalls = 0;
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/v2/auth/login')) {
        expect(init?.method).toBe('POST');
        return new Response('Ok.', {
          status: 200,
          headers: { 'set-cookie': 'SID=abc; HttpOnly' },
        });
      }
      if (url.endsWith('/api/v2/torrents/add')) {
        addCalls += 1;
        expect(init?.method).toBe('POST');
        return new Response('Ok.', { status: 200 });
      }
      if (url.endsWith('/api/v2/torrents/info')) {
        return Response.json([
          {
            hash: 'abc123',
            name: 'Fixture Book',
            content_path: '/tmp/difficulty/Fixture Book.pdf',
            state: 'pausedDL',
          },
        ]);
      }
      if (url.includes('/api/v2/torrents/files?')) {
        return Response.json([
          { index: 0, name: 'Fixture Book.pdf', size: 10_000 },
          { index: 1, name: 'Fixture Book.epub', size: 8_000 },
          { index: 2, name: 'Fixture Book.txt', size: 4_000 },
        ]);
      }
      if (url.endsWith('/api/v2/torrents/filePrio')) {
        const body = init?.body as URLSearchParams;
        priorityCalls.push(`${body.get('id')}:${body.get('priority')}`);
        return new Response('Ok.', { status: 200 });
      }
      throw new Error(`Unexpected URL ${url}`);
    });
    const provider = createQBittorrentProvider({
      baseUrl: 'http://127.0.0.1:8080',
      username: 'user',
      password: 'pass',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      savePath: '/tmp/difficulty',
    });
    const policy = qbitPolicy();
    const book = {
      ...EXAMPLE_BOOK,
      title: 'Fixture Book',
      sourcePath: 'magnet:?xt=urn:btih:fixture',
    };

    const candidates = await provider.findCandidates({ book, policy });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.accessBasis).toBe('user_provided');

    const acquired = await provider.acquire(candidates[0], { book, policy });
    expect(acquired?.contentType).toBe('text/plain');
    expect(acquired?.storagePath).toContain('.txt');
    expect(acquired?.accessBasis).toBe('user_provided');
    expect(acquired?.documentRef?.status).toBe('downloading');
    expect(addCalls).toBe(0);
    expect(priorityCalls).toEqual(['0|1:0', '2:7']);
  });

  it('selects the best matching file inside multi-file torrents and rejects bundled noise', async () => {
    const priorityCalls: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/v2/auth/login')) {
        return new Response('Ok.', {
          status: 200,
          headers: { 'set-cookie': 'SID=abc; HttpOnly' },
        });
      }
      if (url.endsWith('/api/v2/torrents/add')) {
        return new Response('Ok.', { status: 200 });
      }
      if (url.endsWith('/api/v2/torrents/info')) {
        return Response.json([
          {
            hash: 'abc123',
            name: 'Linear Algebra Done Right',
            state: 'pausedDL',
            progress: 0.25,
          },
        ]);
      }
      if (url.includes('/api/v2/torrents/files?')) {
        return Response.json([
          { index: 0, name: 'Preview/sample.pdf', size: 1000, progress: 1 },
          {
            index: 1,
            name: 'Linear Algebra Done Right 4th Edition.pdf',
            size: 10_000,
            progress: 0.25,
          },
          {
            index: 2,
            name: 'Unrelated Topology Notes.pdf',
            size: 8_000,
            progress: 1,
          },
        ]);
      }
      if (url.endsWith('/api/v2/torrents/filePrio')) {
        const body = init?.body as URLSearchParams;
        priorityCalls.push(`${body.get('id')}:${body.get('priority')}`);
        return new Response('Ok.', { status: 200 });
      }
      if (
        url.endsWith('/api/v2/torrents/start') ||
        url.endsWith('/api/v2/torrents/resume')
      ) {
        return new Response('Ok.', { status: 200 });
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
      title: 'Linear Algebra Done Right',
      sourceUrl: 'magnet:?xt=urn:btih:abc123',
      contentKind: 'pdf' as const,
      accessBasis: 'user_provided' as const,
      confidence: 0.9,
      matchScore: 1,
    };

    const acquired = await provider.acquire(candidate, {
      book: {
        ...EXAMPLE_BOOK,
        title: 'Linear Algebra Done Right',
        sourcePath: null,
      },
      policy: qbitPolicy(),
    });

    expect(acquired?.storagePath).toBe(
      '/tmp/difficulty/Linear Algebra Done Right 4th Edition.pdf',
    );
    expect(acquired?.documentRef?.fileIndex).toBe(1);
    expect(priorityCalls).toEqual(['0|2:0', '1:7']);
  });

  it('keeps completed PDFs openable even when byte extraction is unavailable', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/api/v2/auth/login')) {
        return new Response('Ok.', {
          status: 200,
          headers: { 'set-cookie': 'SID=abc; HttpOnly' },
        });
      }
      if (url.endsWith('/api/v2/torrents/add')) {
        return new Response('Ok.', { status: 200 });
      }
      if (url.endsWith('/api/v2/torrents/info')) {
        return Response.json([
          {
            hash: 'abc123',
            name: 'Practical Electronics for Inventors',
            state: 'stalledUP',
            progress: 1,
          },
        ]);
      }
      if (url.includes('/api/v2/torrents/files?')) {
        return Response.json([
          {
            index: 0,
            name: 'Practical Electronics for Inventors 4th Edition.pdf',
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
        return new Response('missing', { status: 400 });
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
      title: 'Practical Electronics for Inventors',
      sourceUrl: 'magnet:?xt=urn:btih:abc123',
      contentKind: 'pdf' as const,
      accessBasis: 'user_provided' as const,
      confidence: 0.9,
      matchScore: 1,
    };

    const acquired = await provider.acquire(candidate, {
      book: {
        ...EXAMPLE_BOOK,
        title: 'Practical Electronics for Inventors',
        sourcePath: null,
      },
      policy: qbitPolicy(),
    });

    expect(acquired?.documentRef?.status).toBe('complete');
    expect(acquired?.documentRef?.contentKind).toBe('pdf');
  });

  it('uses the bridge data root as qBittorrent save path when local settings are relative', async () => {
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
    expect(acquired?.documentRef?.status).toBe('downloading');
  });

  it('skips qBittorrent plugin search when no lawful source whitelist exists', async () => {
    const sourceSettings = createDefaultSourceSettings();
    sourceSettings.documentSources.qbittorrent = true;
    sourceSettings.qbittorrent = {
      ...sourceSettings.qbittorrent,
      userProvidedTorrents: false,
      searchPlugins: true,
      allowedPlugins: [],
      allowedSites: [],
      requireKnownAccessBasis: true,
    };
    const fetchImpl = vi.fn();
    const provider = createQBittorrentProvider({
      baseUrl: 'http://127.0.0.1:8080',
      username: 'user',
      password: 'pass',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const candidates = await provider.findCandidates({
      book: { ...EXAMPLE_BOOK, title: 'Fixture Book', sourcePath: null },
      policy: {
        ...defaultDocumentAcquisitionPolicy(),
        enabled: true,
        sourceSettings,
      },
    });

    expect(candidates).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses whitelisted qBittorrent search plugins to produce lawful document candidates', async () => {
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
          {
            enabled: true,
            fullName: 'Rejected Plugin',
            name: 'rejected',
            supportedCategories: [{ id: 'books', name: 'Books' }],
            url: 'https://example.invalid',
          },
        ]);
      }
      if (url.endsWith('/api/v2/search/start')) {
        const body = init?.body as URLSearchParams;
        searchStartBodies.push(body);
        return Response.json({ id: 42 });
      }
      if (url.includes('/api/v2/search/results?')) {
        return Response.json({
          status: 'Stopped',
          results: [
            {
              fileName: 'Fixture Book.epub',
              fileUrl: 'magnet:?xt=urn:btih:fixture',
              siteUrl: 'https://archive.org/details/fixture-book',
              accessBasis: 'open_access',
              nbSeeders: 4,
              fileSize: 12_000,
            },
            {
              fileName: 'Fixture Book dead.pdf',
              fileUrl: 'magnet:?xt=urn:btih:dead',
              siteUrl: 'https://archive.org/details/fixture-book-dead',
              nbSeeders: 0,
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
      book: { ...EXAMPLE_BOOK, title: 'Fixture Book', sourcePath: null },
      policy: {
        ...defaultDocumentAcquisitionPolicy(),
        enabled: true,
        sourceSettings,
      },
    });

    expect(searchStartBodies.map((body) => body.get('pattern'))).toEqual([
      'fixture book author name',
      'fixture book name',
      'fixture book',
    ]);
    expect(
      new Set(searchStartBodies.map((body) => body.get('plugins'))),
    ).toEqual(new Set(['openarchive']));
    expect(
      new Set(searchStartBodies.map((body) => body.get('category'))),
    ).toEqual(new Set(['books']));
    expect(candidates).toEqual([
      expect.objectContaining({
        provider: 'qbittorrent',
        sourceUrl: 'magnet:?xt=urn:btih:fixture',
        contentKind: 'epub',
        accessBasis: 'open_access',
      }),
    ]);
    expect(candidates).toHaveLength(1);
  });
});
