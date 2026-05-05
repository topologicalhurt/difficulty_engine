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

    const acquired = await provider.acquire(candidate, {
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
    });

    expect(acquired).toBeNull();
    expect(priorityCalls).toEqual(['0:0']);
    expect(resumeCalls).toEqual([]);
  });
});
