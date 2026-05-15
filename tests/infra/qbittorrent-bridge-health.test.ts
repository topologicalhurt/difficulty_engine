import { describe, expect, it, vi } from 'vitest';

import { createDefaultQbittorrentConnectionSettings } from '../../src/core/defaults';
import { checkQbittorrentBridgeHealth } from '../../src/infra/qbittorrent-bridge-health';

function settings() {
  return {
    ...createDefaultQbittorrentConnectionSettings(),
    enabled: true,
    baseUrl: 'http://127.0.0.1:8787',
  };
}

describe('qBittorrent bridge health', () => {
  it('reports a missing bridge before probing qBittorrent APIs', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('NetworkError when attempting to fetch resource.');
    });

    const health = await checkQbittorrentBridgeHealth(fetchImpl, {
      ...settings(),
      savePath: '/tmp/docs',
    });

    expect(health.status).toBe('not_running');
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/__health',
      expect.anything(),
    );
  });

  it('reports an origin rejection without retrying through a wildcard path', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 403 }));

    const health = await checkQbittorrentBridgeHealth(fetchImpl, {
      ...settings(),
      savePath: '/tmp/docs',
    });

    expect(health.status).toBe('origin_blocked');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('reports qBittorrent separately when the bridge is up', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/__health')) {
        return new Response(
          JSON.stringify({
            ok: true,
            targetBaseUrl: 'http://user:secret@127.0.0.1:8080',
            dataRoot: '/tmp/docs',
            allowedOrigins: ['null'],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: false }), { status: 502 });
    });

    const health = await checkQbittorrentBridgeHealth(fetchImpl, {
      ...settings(),
      savePath: '/tmp/docs',
    });

    expect(health).toMatchObject({
      status: 'qbit_unreachable',
      targetBaseUrl: 'http://127.0.0.1:8080',
      dataRoot: '/tmp/docs',
      allowedOrigins: ['null'],
    });
    expect(JSON.stringify(health)).not.toContain('secret');
  });

  it('rejects a bridge running with a different document data root', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/__health')) {
        return Response.json({
          ok: true,
          targetBaseUrl: 'http://127.0.0.1:8080',
          dataRoot: '/repo/data/documents',
          allowedOrigins: ['null'],
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const health = await checkQbittorrentBridgeHealth(fetchImpl, {
      ...settings(),
      savePath: 'output/data/documents',
    });

    expect(health.status).toBe('data_root_mismatch');
    expect(health.message).toContain('output/data/documents');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
