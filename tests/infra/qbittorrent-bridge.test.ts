import { createServer, type Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

interface BridgeModule {
  createQbittorrentBridgeServer(options: {
    listenUrl?: string;
    targetBaseUrl?: string;
    dataRoot?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    allowedOrigins?: string[];
  }): Server;
}

async function bridgeModule(): Promise<BridgeModule> {
  return await import('../../scripts/qbittorrent-bridge.mjs') as BridgeModule;
}

function listen(server: Server): Promise<string> {
  return new Promise((resolveListen) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Expected TCP server address.');
      }
      resolveListen(`http://127.0.0.1:${address.port}`);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolveClose) => server.close(() => resolveClose()));
}

describe('qBittorrent browser bridge', () => {
  it('adds CORS for allowed origins while stripping browser origin before forwarding to qBittorrent', async () => {
    const seen: Array<{ url?: string; origin?: string; cookie?: string }> = [];
    const upstream = createServer((req, res) => {
      seen.push({
        url: req.url,
        origin: req.headers.origin,
        cookie: req.headers.cookie,
      });
      if (req.headers.origin) {
        res.statusCode = 401;
        res.end('Unauthorized');
        return;
      }
      res.setHeader('set-cookie', 'SID=bridge-test; HttpOnly; SameSite=Strict; path=/');
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify([{ name: 'open', enabled: true }]));
    });
    const targetBaseUrl = await listen(upstream);
    const { createQbittorrentBridgeServer } = await bridgeModule();
    const bridge = createQbittorrentBridgeServer({
      targetBaseUrl,
      allowedOrigins: ['file://', 'http://127.0.0.1:*'],
    });
    const bridgeBaseUrl = await listen(bridge);

    try {
      const first = await fetch(`${bridgeBaseUrl}/api/v2/app/version`, {
        headers: { Origin: 'file://' },
      });
      const second = await fetch(`${bridgeBaseUrl}/api/v2/search/plugins`, {
        headers: { Origin: 'http://127.0.0.1:4184' },
      });

      expect(first.status).toBe(200);
      expect(first.headers.get('access-control-allow-origin')).toBe('file://');
      expect(second.status).toBe(200);
      expect(seen[0]).toMatchObject({ origin: undefined, cookie: undefined });
      expect(seen[1]).toMatchObject({ origin: undefined, cookie: 'SID=bridge-test' });
    } finally {
      await close(bridge);
      await close(upstream);
    }
  });

  it('rejects disallowed browser origins before proxying or reading local documents', async () => {
    const root = await mkdtemp(join(tmpdir(), 'difficulty-docs-'));
    const allowed = join(root, 'book.txt');
    await writeFile(allowed, 'Chapter 1', 'utf8');
    let upstreamCalled = false;
    const upstream = createServer((_req, res) => {
      upstreamCalled = true;
      res.end('should not be reached');
    });
    const targetBaseUrl = await listen(upstream);
    const { createQbittorrentBridgeServer } = await bridgeModule();
    const bridge = createQbittorrentBridgeServer({ targetBaseUrl, dataRoot: root });
    const bridgeBaseUrl = await listen(bridge);

    try {
      const api = await fetch(`${bridgeBaseUrl}/api/v2/app/version`, {
        headers: { Origin: 'https://evil.example' },
      });
      const docs = await fetch(`${bridgeBaseUrl}/documents/read-text?${new URLSearchParams({ path: allowed }).toString()}`, {
        headers: { Origin: 'https://evil.example' },
      });

      expect(api.status).toBe(403);
      expect(docs.status).toBe(403);
      expect(api.headers.get('access-control-allow-origin')).toBeNull();
      expect(upstreamCalled).toBe(false);
    } finally {
      await close(bridge);
      await close(upstream);
      await rm(root, { recursive: true, force: true });
    }
  });

  it('serves only documents inside the configured data root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'difficulty-docs-'));
    const allowed = join(root, 'book.txt');
    const outside = join(tmpdir(), 'outside-book.txt');
    await writeFile(allowed, 'Contents\nChapter 1\nFoundations', 'utf8');
    await writeFile(outside, 'outside', 'utf8');
    const { createQbittorrentBridgeServer } = await bridgeModule();
    const bridge = createQbittorrentBridgeServer({ dataRoot: root });
    const bridgeBaseUrl = await listen(bridge);

    try {
      const listed = await fetch(`${bridgeBaseUrl}/documents/list`);
      const text = await fetch(`${bridgeBaseUrl}/documents/read-text?${new URLSearchParams({ path: allowed }).toString()}`);
      const status = await fetch(`${bridgeBaseUrl}/documents/status?${new URLSearchParams({ path: allowed }).toString()}`);
      const rejected = await fetch(`${bridgeBaseUrl}/documents/read-text?${new URLSearchParams({ path: outside }).toString()}`);

      expect(listed.status).toBe(200);
      expect(await text.text()).toContain('Chapter 1');
      expect((await status.json()).sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(rejected.status).toBe(400);
      expect(await rejected.text()).toContain('outside the configured data folder');
    } finally {
      await close(bridge);
    }
  });

  it('accepts project-relative document paths when the data root is under the app workspace', async () => {
    const root = await mkdtemp(join(process.cwd(), '.tmp-docs-'));
    const allowed = join(root, 'book.txt');
    await writeFile(allowed, 'Chapter 1\nRelative path', 'utf8');
    const { createQbittorrentBridgeServer } = await bridgeModule();
    const bridge = createQbittorrentBridgeServer({ dataRoot: root });
    const bridgeBaseUrl = await listen(bridge);

    try {
      const projectRelativePath = relative(process.cwd(), allowed);
      const text = await fetch(`${bridgeBaseUrl}/documents/read-text?${new URLSearchParams({ path: projectRelativePath }).toString()}`);

      expect(text.status).toBe(200);
      expect(await text.text()).toContain('Relative path');
    } finally {
      await close(bridge);
      await rm(root, { recursive: true, force: true });
    }
  });

  it('accepts paths prefixed with the configured root suffix', async () => {
    const root = await mkdtemp(join(tmpdir(), 'difficulty-docs-'));
    const nested = join(root, 'book.pdf');
    await writeFile(nested, '%PDF test', 'utf8');
    const { createQbittorrentBridgeServer } = await bridgeModule();
    const bridge = createQbittorrentBridgeServer({ dataRoot: root });
    const bridgeBaseUrl = await listen(bridge);

    try {
      const status = await fetch(`${bridgeBaseUrl}/documents/status?${new URLSearchParams({ path: `${relative(join(root, '..', '..'), root)}/book.pdf` }).toString()}`);

      expect(status.status).toBe(200);
      expect((await status.json()).name).toBe('book.pdf');
    } finally {
      await close(bridge);
      await rm(root, { recursive: true, force: true });
    }
  });
});
