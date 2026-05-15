import { describe, expect, it } from 'vitest';

import { runQbittorrentPluginSearch } from '../../src/infra/qbittorrent-plugin-api';

describe('qBittorrent plugin API', () => {
  it('limits search jobs globally below the qBittorrent running-search cap', async () => {
    let nextSearchId = 1;
    let activeSearches = 0;
    let peakSearches = 0;
    const api = async (
      path: string,
      init?: RequestInit,
    ): Promise<Response> => {
      if (path === '/search/start') {
        activeSearches += 1;
        peakSearches = Math.max(peakSearches, activeSearches);
        return Response.json({ id: nextSearchId++ });
      }
      if (path.startsWith('/search/results?')) {
        await new Promise((resolve) => {
          setTimeout(resolve, 5);
        });
        return Response.json({ status: 'Stopped', results: [] });
      }
      if (path === '/search/delete') {
        activeSearches -= 1;
        expect(init?.method).toBe('POST');
        return new Response('Ok.', { status: 200 });
      }
      throw new Error(`Unexpected path ${path}`);
    };

    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        runQbittorrentPluginSearch(
          api,
          `fixture ${index}`,
          'limetorrents',
          'all',
          10,
        ),
      ),
    );

    expect(peakSearches).toBeLessThanOrEqual(4);
    expect(activeSearches).toBe(0);
  });
});
