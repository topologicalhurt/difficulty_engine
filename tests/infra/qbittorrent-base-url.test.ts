import { describe, expect, it } from 'vitest';

import {
  isAllowedQbittorrentBaseUrl,
  requestQbittorrentApi,
} from '../../src/infra/qbittorrent-http';

describe('qBittorrent base URL allowlist', () => {
  it('allows https anywhere and http only on loopback', () => {
    expect(isAllowedQbittorrentBaseUrl('http://127.0.0.1:8787')).toBe(true);
    expect(isAllowedQbittorrentBaseUrl('http://localhost:8787')).toBe(true);
    expect(isAllowedQbittorrentBaseUrl('http://[::1]:8787')).toBe(true);
    expect(isAllowedQbittorrentBaseUrl('https://remote.example.com')).toBe(true);
  });

  it('rejects plaintext HTTP to a non-loopback host', () => {
    expect(isAllowedQbittorrentBaseUrl('http://192.168.1.50:9091')).toBe(false);
    expect(isAllowedQbittorrentBaseUrl('http://evil.example.com')).toBe(false);
    expect(isAllowedQbittorrentBaseUrl('ftp://127.0.0.1')).toBe(false);
    expect(isAllowedQbittorrentBaseUrl('not a url')).toBe(false);
  });

  it('refuses to issue a request to a disallowed base URL', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;

    await expect(
      requestQbittorrentApi(
        fetchImpl,
        'http://192.168.1.50:9091',
        '/auth/login',
        { method: 'POST' },
        '',
        1000,
      ),
    ).rejects.toThrow(/loopback/i);
    expect(called).toBe(false);
  });
});
