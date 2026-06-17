import { describe, expect, it } from 'vitest';

import {
  parseQbittorrentJsonArray,
  parseQbittorrentJsonObject,
} from '../../src/infra/qbittorrent-http';

describe('qBittorrent safe JSON parsing', () => {
  it('returns the array for a valid JSON array body', async () => {
    const response = new Response(JSON.stringify([{ hash: 'a' }]));
    expect(await parseQbittorrentJsonArray(response, '/torrents/info')).toEqual([
      { hash: 'a' },
    ]);
  });

  it('throws a diagnostic error for a non-JSON 200 body', async () => {
    const response = new Response('<html>login redirect</html>');
    await expect(
      parseQbittorrentJsonArray(response, '/torrents/info'),
    ).rejects.toThrow(/non-JSON body/);
  });

  it('rejects a JSON object where an array is expected', async () => {
    const response = new Response(JSON.stringify({ error: 'nope' }));
    await expect(
      parseQbittorrentJsonArray(response, '/torrents/info'),
    ).rejects.toThrow(/expected a JSON array/);
  });

  it('returns the object for a valid JSON object body', async () => {
    const response = new Response(JSON.stringify({ id: 5 }));
    expect(
      await parseQbittorrentJsonObject(response, '/search/start'),
    ).toEqual({ id: 5 });
  });

  it('rejects an array where an object is expected', async () => {
    const response = new Response(JSON.stringify([1, 2, 3]));
    await expect(
      parseQbittorrentJsonObject(response, '/search/results'),
    ).rejects.toThrow(/expected a JSON object/);
  });
});
