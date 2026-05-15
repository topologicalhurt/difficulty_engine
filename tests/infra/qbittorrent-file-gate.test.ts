import { describe, expect, it, vi } from 'vitest';

import {
  EXAMPLE_BOOK,
  createDefaultSourceSettings,
} from '../../src/core/defaults';
import { defaultDocumentAcquisitionPolicy } from '../../src/infra/document-acquisition';
import { createQBittorrentProvider } from '../../src/infra/qbittorrent-provider';

describe('qBittorrent selected file gate', () => {
  it('rejects completed torrent files that do not match the requested book', async () => {
    const priorityCalls: string[] = [];
    const resumeCalls: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
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
            name: 'Linear Algebra Done Right',
            state: 'pausedDL',
            progress: 1,
          },
        ]);
      }
      if (url.includes('/api/v2/torrents/files?')) {
        return Response.json([
          {
            index: 0,
            name: 'Unrelated Topology Notes.pdf',
            size: 10_000,
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
        resumeCalls.push(url);
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
    const sourceSettings = createDefaultSourceSettings();
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

    await expect(
      provider.acquire(candidate, {
        book: {
          ...EXAMPLE_BOOK,
          title: 'Linear Algebra Done Right',
          sourcePath: null,
        },
        policy: {
          ...defaultDocumentAcquisitionPolicy(),
          enabled: true,
          sourceSettings,
        },
      }),
    ).rejects.toThrow('none passed the title, author, or ISBN trust checks');
    expect(priorityCalls).toEqual(['0:0']);
    expect(resumeCalls).toEqual([]);
  });

  it('accepts a trusted single-file torrent when the file has author evidence', async () => {
    const priorityCalls: string[] = [];
    const resumeCalls: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/v2/auth/login')) {
        return new Response('Ok.', {
          status: 200,
          headers: { 'set-cookie': 'SID=abc; HttpOnly' },
        });
      }
      if (url.endsWith('/api/v2/torrents/info')) {
        return Response.json([
          {
            hash: 'steinhash',
            name: 'Stein E Lectures in Analysis Vol 4 Functional Analysis 2012',
            save_path: 'output/data/documents',
            state: 'pausedDL',
            progress: 0.2,
            num_seeds: 12,
            num_leechs: 4,
          },
        ]);
      }
      if (url.includes('/api/v2/torrents/files?')) {
        return Response.json([
          {
            index: 0,
            name: 'Stein E Lectures in Analysis Vol 4 Functional Analysis 2012.pdf',
            size: 10_000,
            progress: 0.2,
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
        resumeCalls.push(url);
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
    const sourceSettings = createDefaultSourceSettings();
    const candidate = {
      id: 'stein-search',
      provider: 'qbittorrent',
      title: 'Stein E Lectures in Analysis Vol 4 Functional Analysis 2012',
      sourceUrl:
        'https://www.limetorrents.lol/Stein-E-Lectures-in-Analysis-Vol-4-Functional-Analysis-2012-torrent-17818262.html',
      contentKind: 'pdf' as const,
      accessBasis: 'user_owned' as const,
      confidence: 0.92,
      matchScore: 1,
      seeders: 12,
      peers: 4,
    };

    const acquired = await provider.acquire(candidate, {
      book: {
        ...EXAMPLE_BOOK,
        title: 'Functional Analysis',
        authors: ['Elias Stein'],
        sourcePath: null,
      },
      policy: {
        ...defaultDocumentAcquisitionPolicy(),
        enabled: true,
        sourceSettings,
      },
    });

    const ref = acquired?.documentRef;
    expect(ref?.torrentHash).toBe('steinhash');
    expect(ref?.fileIndex).toBe(0);
    expect(ref?.fileName).toBe(
      'Stein E Lectures in Analysis Vol 4 Functional Analysis 2012.pdf',
    );
    expect(priorityCalls).toEqual(['0:7']);
    expect(resumeCalls).toHaveLength(1);
  });

  it('keeps a queued ref while qBittorrent file metadata is pending', async () => {
    const priorityCalls: string[] = [];
    const resumeCalls: string[] = [];
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/v2/auth/login')) {
        return new Response('Ok.', {
          status: 200,
          headers: { 'set-cookie': 'SID=abc; HttpOnly' },
        });
      }
      if (url.endsWith('/api/v2/torrents/info')) {
        return Response.json([
          {
            hash: 'pendinghash',
            name: 'Stein E Lectures in Analysis Vol 4 Functional Analysis 2012',
            save_path: 'output/data/documents',
            state: 'metaDL',
            progress: 0,
            num_seeds: 12,
            num_leechs: 4,
          },
        ]);
      }
      if (url.includes('/api/v2/torrents/files?')) {
        return Response.json([]);
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
        resumeCalls.push(url);
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
    const sourceSettings = createDefaultSourceSettings();
    const candidate = {
      id: 'stein-pending',
      provider: 'qbittorrent',
      title: 'Stein E Lectures in Analysis Vol 4 Functional Analysis 2012',
      sourceUrl:
        'https://www.limetorrents.lol/Stein-E-Lectures-in-Analysis-Vol-4-Functional-Analysis-2012-torrent-17818262.html',
      contentKind: 'pdf' as const,
      accessBasis: 'user_owned' as const,
      confidence: 0.92,
      matchScore: 1,
      seeders: 12,
      peers: 4,
    };

    const acquired = await provider.acquire(candidate, {
      book: {
        ...EXAMPLE_BOOK,
        title: 'Functional Analysis',
        authors: ['Elias Stein'],
        sourcePath: null,
      },
      policy: {
        ...defaultDocumentAcquisitionPolicy(),
        enabled: true,
        sourceSettings,
      },
    });

    expect(acquired?.documentRef).toEqual(
      expect.objectContaining({
        provider: 'qbittorrent',
        torrentHash: 'pendinghash',
        contentKind: 'pdf',
        status: 'queued',
      }),
    );
    expect(acquired?.documentRef).not.toHaveProperty('fileIndex');
    expect(acquired?.documentRef?.availability.reason).toContain(
      'file metadata',
    );
    expect(priorityCalls).toEqual([]);
    expect(resumeCalls).toEqual([]);
  });
});
