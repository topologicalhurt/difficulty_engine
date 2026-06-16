import { describe, expect, it } from 'vitest';

import { QBittorrentClient } from '../../src/infra/qbittorrent-client';
import type { DocumentCandidate } from '../../src/infra/document-acquisition';

function clientWithTorrents(
  torrents: Array<{ hash: string; name: string; category?: string }>,
): QBittorrentClient {
  const fetchImpl = (async (url: string) => {
    if (String(url).includes('/torrents/info')) {
      return new Response(JSON.stringify(torrents), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('[]', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return new QBittorrentClient({
    baseUrl: 'http://127.0.0.1:8080',
    username: '',
    password: '',
    category: 'difficulty-engine',
    fetchImpl,
  });
}

function candidate(title: string): DocumentCandidate {
  return {
    id: 'c1',
    provider: 'qbittorrent',
    title,
    sourceUrl: 'https://example.test/physics.torrent',
    contentKind: 'pdf',
    accessBasis: 'user_provided',
    confidence: 0.8,
    matchScore: 0.8,
  } as unknown as DocumentCandidate;
}

describe('QBittorrentClient.torrentInfo identity', () => {
  it('does not bind a short title to an unrelated torrent outside the app category', () => {
    const client = clientWithTorrents([
      { hash: 'aaa', name: 'Some Unrelated Physics Documentary Pack', category: 'movies' },
      { hash: 'bbb', name: 'Physics', category: 'difficulty-engine' },
    ]);

    return client.torrentInfo(candidate('Physics')).then((info) => {
      expect(info?.hash).toBe('bbb');
    });
  });

  it('returns null rather than matching an unrelated user torrent by substring', () => {
    const client = clientWithTorrents([
      { hash: 'aaa', name: 'Some Unrelated Physics Documentary Pack', category: 'movies' },
    ]);

    return client.torrentInfo(candidate('Physics')).then((info) => {
      expect(info).toBeNull();
    });
  });
});
