import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
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
    openDocument?: (filePath: string, mode: 'open' | 'reveal') => void;
    backupRoot?: string;
  }): Server;
}

async function bridgeModule(): Promise<BridgeModule> {
  return (await import('../../scripts/qbittorrent-bridge.mjs')) as BridgeModule;
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

function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
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
      res.setHeader(
        'set-cookie',
        'SID=bridge-test; HttpOnly; SameSite=Strict; path=/',
      );
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
      expect(seen[1]).toMatchObject({
        origin: undefined,
        cookie: 'SID=bridge-test',
      });
    } finally {
      await close(bridge);
      await close(upstream);
    }
  });

  it('allows standalone file app requests with Origin null by default', async () => {
    const upstream = createServer((_req, res) => {
      res.setHeader('Content-Type', 'text/plain');
      res.end('v-test');
    });
    const targetBaseUrl = await listen(upstream);
    const { createQbittorrentBridgeServer } = await bridgeModule();
    const bridge = createQbittorrentBridgeServer({ targetBaseUrl });
    const bridgeBaseUrl = await listen(bridge);

    try {
      const response = await fetch(`${bridgeBaseUrl}/api/v2/app/version`, {
        headers: { Origin: 'null' },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe('null');
      expect(await response.text()).toBe('v-test');
    } finally {
      await close(bridge);
      await close(upstream);
    }
  });

  it('writes project backups only inside the configured backup root', async () => {
    const backupRoot = await mkdtemp(join(tmpdir(), 'difficulty-backups-'));
    const { createQbittorrentBridgeServer } = await bridgeModule();
    const bridge = createQbittorrentBridgeServer({ backupRoot });
    const bridgeBaseUrl = await listen(bridge);

    try {
      const response = await fetch(`${bridgeBaseUrl}/project-backups/write`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Origin: 'null',
        },
        body: JSON.stringify({
          storageKey: '../unsafe/key',
          projectJson: JSON.stringify({
            version: 1,
            library: { books: {} },
            manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
            constraints: {},
            aiRecommendationSettings: {},
            sourceSettings: {},
            enrichmentCache: {},
            uiPreferences: {},
          }),
        }),
      });
      const payload = (await response.json()) as { path: string };
      const files = await readdir(backupRoot);

      expect(response.status).toBe(200);
      expect(relative(backupRoot, payload.path).startsWith('..')).toBe(false);
      expect(files).toHaveLength(1);
    } finally {
      await close(bridge);
      await rm(backupRoot, { recursive: true, force: true });
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
    const bridge = createQbittorrentBridgeServer({
      targetBaseUrl,
      dataRoot: root,
    });
    const bridgeBaseUrl = await listen(bridge);

    try {
      const api = await fetch(`${bridgeBaseUrl}/api/v2/app/version`, {
        headers: { Origin: 'https://evil.example' },
      });
      const docs = await fetch(
        `${bridgeBaseUrl}/documents/read-text?${new URLSearchParams({ path: allowed }).toString()}`,
        {
          headers: { Origin: 'https://evil.example' },
        },
      );

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

  it('rejects loopback browser origins that are not in a custom allowlist', async () => {
    let upstreamCalled = false;
    const upstream = createServer((_req, res) => {
      upstreamCalled = true;
      res.end('should not be reached');
    });
    const targetBaseUrl = await listen(upstream);
    const { createQbittorrentBridgeServer } = await bridgeModule();
    const bridge = createQbittorrentBridgeServer({
      targetBaseUrl,
      allowedOrigins: ['https://planner.example'],
    });
    const bridgeBaseUrl = await listen(bridge);

    try {
      const response = await fetch(`${bridgeBaseUrl}/api/v2/app/version`, {
        headers: { Origin: 'http://127.0.0.1:4184' },
      });

      expect(response.status).toBe(403);
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
      expect(upstreamCalled).toBe(false);
    } finally {
      await close(bridge);
      await close(upstream);
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
      const text = await fetch(
        `${bridgeBaseUrl}/documents/read-text?${new URLSearchParams({ path: allowed }).toString()}`,
      );
      const status = await fetch(
        `${bridgeBaseUrl}/documents/status?${new URLSearchParams({ path: allowed }).toString()}`,
      );
      const rejected = await fetch(
        `${bridgeBaseUrl}/documents/read-text?${new URLSearchParams({ path: outside }).toString()}`,
      );

      expect(listed.status).toBe(200);
      expect(await text.text()).toContain('Chapter 1');
      expect((await status.json()).sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(rejected.status).toBe(400);
      expect(await rejected.text()).toContain(
        'outside the configured data folder',
      );
    } finally {
      await close(bridge);
    }
  });

  it('rejects unsupported document files instead of opening or byte-reading them', async () => {
    const root = await mkdtemp(join(tmpdir(), 'difficulty-docs-'));
    const unsupported = join(root, 'tool.command');
    await writeFile(unsupported, '#!/bin/sh\necho unsafe', 'utf8');
    const { createQbittorrentBridgeServer } = await bridgeModule();
    const bridge = createQbittorrentBridgeServer({ dataRoot: root });
    const bridgeBaseUrl = await listen(bridge);

    try {
      const read = await fetch(
        `${bridgeBaseUrl}/documents/read-bytes?${new URLSearchParams({ path: unsupported }).toString()}`,
      );
      const open = await fetch(`${bridgeBaseUrl}/documents/open`, {
        method: 'POST',
        body: JSON.stringify({ path: unsupported }),
        headers: { 'Content-Type': 'application/json' },
      });

      expect(read.status).toBe(400);
      expect(open.status).toBe(400);
      expect(await open.text()).toContain(
        'Only text, EPUB, and PDF documents can be accessed.',
      );
    } finally {
      await close(bridge);
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reveals and deletes only supported files inside the data root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'difficulty-docs-'));
    const allowed = join(root, 'book.pdf');
    const outside = join(tmpdir(), 'outside-book.pdf');
    await writeFile(allowed, '%PDF allowed', 'utf8');
    await writeFile(outside, '%PDF outside', 'utf8');
    const opened: Array<{ path: string; mode: 'open' | 'reveal' }> = [];
    const { createQbittorrentBridgeServer } = await bridgeModule();
    const bridge = createQbittorrentBridgeServer({
      dataRoot: root,
      openDocument: (path, mode) => opened.push({ path, mode }),
    });
    const bridgeBaseUrl = await listen(bridge);

    try {
      const reveal = await fetch(`${bridgeBaseUrl}/documents/reveal`, {
        method: 'POST',
        body: JSON.stringify({ path: allowed }),
        headers: { 'Content-Type': 'application/json' },
      });
      const rejected = await fetch(`${bridgeBaseUrl}/documents/delete`, {
        method: 'POST',
        body: JSON.stringify({ path: outside }),
        headers: { 'Content-Type': 'application/json' },
      });
      const deleted = await fetch(`${bridgeBaseUrl}/documents/delete`, {
        method: 'POST',
        body: JSON.stringify({ path: allowed }),
        headers: { 'Content-Type': 'application/json' },
      });
      const status = await fetch(
        `${bridgeBaseUrl}/documents/status?${new URLSearchParams({ path: allowed }).toString()}`,
      );

      expect(reveal.status).toBe(200);
      expect(opened).toEqual([{ path: allowed, mode: 'reveal' }]);
      expect(rejected.status).toBe(400);
      expect(await rejected.text()).toContain(
        'outside the configured data folder',
      );
      expect(deleted.status).toBe(200);
      expect(status.status).toBe(400);
    } finally {
      await close(bridge);
      await rm(root, { recursive: true, force: true });
      await rm(outside, { force: true });
    }
  });

  it('rejects oversized document action request bodies', async () => {
    const root = await mkdtemp(join(tmpdir(), 'difficulty-docs-'));
    const { createQbittorrentBridgeServer } = await bridgeModule();
    const bridge = createQbittorrentBridgeServer({ dataRoot: root });
    const bridgeBaseUrl = await listen(bridge);

    try {
      const response = await fetch(`${bridgeBaseUrl}/documents/open`, {
        method: 'POST',
        body: 'x'.repeat(20_000),
        headers: { 'Content-Type': 'application/json' },
      });

      expect(response.status).toBe(400);
      expect(await response.text()).toContain('Request body is too large.');
    } finally {
      await close(bridge);
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects oversized local document reads through the bridge', async () => {
    const root = await mkdtemp(join(tmpdir(), 'difficulty-docs-'));
    const hugeText = join(root, 'huge.txt');
    await writeFile(hugeText, 'x'.repeat(9 * 1024 * 1024), 'utf8');
    const { createQbittorrentBridgeServer } = await bridgeModule();
    const bridge = createQbittorrentBridgeServer({ dataRoot: root });
    const bridgeBaseUrl = await listen(bridge);

    try {
      const response = await fetch(
        `${bridgeBaseUrl}/documents/read-text?${new URLSearchParams({ path: hugeText }).toString()}`,
      );

      expect(response.status).toBe(400);
      expect(await response.text()).toContain(
        'Text document is too large to read through the bridge.',
      );
    } finally {
      await close(bridge);
      await rm(root, { recursive: true, force: true });
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
      const text = await fetch(
        `${bridgeBaseUrl}/documents/read-text?${new URLSearchParams({ path: projectRelativePath }).toString()}`,
      );

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
      const status = await fetch(
        `${bridgeBaseUrl}/documents/status?${new URLSearchParams({ path: `${relative(join(root, '..', '..'), root)}/book.pdf` }).toString()}`,
      );

      expect(status.status).toBe(200);
      expect((await status.json()).name).toBe('book.pdf');
    } finally {
      await close(bridge);
      await rm(root, { recursive: true, force: true });
    }
  });

  it('serves cached OCR sidecars and keeps OCR endpoints inside the data root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'difficulty-docs-'));
    const pdf = join(root, 'book.pdf');
    const pdfContent = '%PDF fixture';
    await writeFile(pdf, pdfContent, 'utf8');
    const sidecarDir = join(root, '.difficulty-engine-ocr');
    await mkdir(sidecarDir, { recursive: true });
    await writeFile(
      join(sidecarDir, `${sha256Text(pdfContent)}.toc.txt`),
      'Contents\nChapter 1 Cached OCR',
      'utf8',
    );
    await writeFile(
      join(sidecarDir, `${sha256Text(pdfContent)}.toc.json`),
      JSON.stringify({
        confidence: 0.91,
        psmModes: ['6'],
        pageRange: { start: 1, end: 4 },
      }),
      'utf8',
    );
    const outside = join(tmpdir(), 'outside-book.pdf');
    await writeFile(outside, pdfContent, 'utf8');
    const { createQbittorrentBridgeServer } = await bridgeModule();
    const bridge = createQbittorrentBridgeServer({ dataRoot: root });
    const bridgeBaseUrl = await listen(bridge);

    try {
      const cached = await fetch(
        `${bridgeBaseUrl}/documents/ocr-status?${new URLSearchParams({ path: pdf }).toString()}`,
      );
      const rejected = await fetch(
        `${bridgeBaseUrl}/documents/ocr-status?${new URLSearchParams({ path: outside }).toString()}`,
      );

      expect(cached.status).toBe(200);
      expect(await cached.json()).toMatchObject({
        status: 'complete',
        text: 'Contents\nChapter 1 Cached OCR',
        metadata: {
          confidence: 0.91,
          psmModes: ['6'],
          pageRange: { start: 1, end: 4 },
        },
      });
      expect(rejected.status).toBe(400);
    } finally {
      await close(bridge);
      await rm(root, { recursive: true, force: true });
      await rm(outside, { force: true });
    }
  });
});
