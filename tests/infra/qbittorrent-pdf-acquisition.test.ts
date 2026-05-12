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

describe('qBittorrent PDF acquisition', () => {
  it('fails with a PDF eligibility reason when no top-surface PDF exists', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/api/v2/auth/login')) {
        return new Response('Ok.', {
          status: 200,
          headers: { 'set-cookie': 'SID=abc; HttpOnly' },
        });
      }
      if (url.endsWith('/api/v2/torrents/info')) {
        return Response.json([
          { hash: 'abc123', name: 'Fixture Book', state: 'pausedDL' },
        ]);
      }
      if (url.includes('/api/v2/torrents/files?')) {
        return Response.json([
          {
            index: 0,
            name: 'Fixture Book/extras/Fixture Book.pdf',
            size: 10_000,
          },
          { index: 1, name: 'Fixture Book/Fixture Book.txt', size: 3_000 },
        ]);
      }
      if (url.endsWith('/api/v2/torrents/filePrio')) {
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
      title: 'Fixture Book',
      sourceUrl: 'magnet:?xt=urn:btih:abc123',
      contentKind: 'unknown' as const,
      accessBasis: 'user_provided' as const,
      confidence: 0.9,
      matchScore: 1,
    };

    await expect(
      provider.acquire(candidate, {
        book: { ...EXAMPLE_BOOK, title: 'Fixture Book', sourcePath: null },
        policy: qbitPolicy(),
      }),
    ).rejects.toThrow('No eligible top-surface PDF');
  });
});
