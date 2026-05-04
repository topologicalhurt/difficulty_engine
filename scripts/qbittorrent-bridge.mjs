import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const DEFAULT_LISTEN_URL = 'http://127.0.0.1:8787';
const DEFAULT_TARGET_URL = 'http://127.0.0.1:8080';
const DEFAULT_DATA_ROOT = resolve(process.cwd(), 'data', 'documents');
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_ALLOWED_ORIGINS = ['http://127.0.0.1:*', 'http://localhost:*', 'http://[::1]:*'];
const PDF_TEXT_PAGE_LIMIT = 80;
const PDF_TEXT_TIMEOUT_MS = 20_000;
const TEXT_EXTENSIONS = new Set(['.txt', '.text']);
const OCR_TEXT_PATTERN = /(?:_djvu\.txt|ocr\.txt)$/i;
const PDF_EXTENSIONS = new Set(['.pdf']);
const EPUB_EXTENSIONS = new Set(['.epub']);
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'set-cookie',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
const PDFKIT_HELPER_SOURCE = `
import Foundation
import PDFKit

let path = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ""
let pageLimit = CommandLine.arguments.count > 2 ? (Int(CommandLine.arguments[2]) ?? ${PDF_TEXT_PAGE_LIMIT}) : ${PDF_TEXT_PAGE_LIMIT}
let url = URL(fileURLWithPath: path)
guard let document = PDFDocument(url: url) else {
  FileHandle.standardError.write(Data("Unable to open PDF.\\n".utf8))
  exit(2)
}
let count = min(document.pageCount, pageLimit)
for index in 0..<count {
  if let page = document.page(at: index), let text = page.string, !text.isEmpty {
    print(text)
    print("\\n")
  }
}
`;
const pdfKitHelperCache = new Map();

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function trimBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

function parseAllowedOrigins(value) {
  if (!value) return [...DEFAULT_ALLOWED_ORIGINS];
  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isLoopbackOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return ['http:', 'https:'].includes(parsed.protocol) &&
      ['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function originMatchesPattern(origin, pattern) {
  if (pattern === origin) return true;
  if (!pattern.endsWith(':*')) return false;
  try {
    const parsedOrigin = new URL(origin);
    const parsedPattern = new URL(pattern.slice(0, -2));
    return parsedOrigin.protocol === parsedPattern.protocol &&
      parsedOrigin.hostname === parsedPattern.hostname;
  } catch {
    return false;
  }
}

function originAllowed(req, allowedOrigins) {
  const origin = req.headers.origin;
  if (!origin) return true;
  if (isLoopbackOrigin(origin)) return true;
  return allowedOrigins.some((allowed) => originMatchesPattern(origin, allowed));
}

function setCors(req, res, allowedOrigins = DEFAULT_ALLOWED_ORIGINS) {
  const origin = req.headers.origin;
  if (origin && originAllowed(req, allowedOrigins)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
  res.setHeader('Vary', 'Origin');
}

function rejectDisallowedOrigin(req, res, allowedOrigins) {
  if (originAllowed(req, allowedOrigins)) return false;
  res.statusCode = 403;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ ok: false, error: 'Origin is not allowed by the qBittorrent bridge.' }));
  return true;
}

function readBody(req) {
  return new Promise((resolveRead, rejectRead) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('error', rejectRead);
    req.on('end', () => resolveRead(Buffer.concat(chunks)));
  });
}

function targetUrl(targetBaseUrl, reqUrl = '/') {
  const incoming = new URL(reqUrl, DEFAULT_LISTEN_URL);
  return `${targetBaseUrl}${incoming.pathname}${incoming.search}`;
}

function forwardHeaders(req, cookie) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    const lower = key.toLowerCase();
    if (
      HOP_BY_HOP_HEADERS.has(lower) ||
      lower === 'host' ||
      lower === 'origin' ||
      lower === 'referer'
    ) {
      continue;
    }
    if (Array.isArray(value)) headers[key] = value.join(', ');
    else if (value != null) headers[key] = String(value);
  }
  if (cookie) headers.Cookie = cookie;
  return headers;
}

function writeBridgeError(req, res, status, message, allowedOrigins = DEFAULT_ALLOWED_ORIGINS) {
  setCors(req, res, allowedOrigins);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ ok: false, error: message }));
}

function contentTypeFromPath(filePath) {
  const lower = filePath.toLowerCase();
  const extension = extname(lower);
  if (TEXT_EXTENSIONS.has(extension) || OCR_TEXT_PATTERN.test(lower)) return 'text/plain; charset=utf-8';
  if (PDF_EXTENSIONS.has(extension)) return 'application/pdf';
  if (EPUB_EXTENSIONS.has(extension)) return 'application/epub+zip';
  return 'application/octet-stream';
}

function contentKindFromPath(filePath) {
  const lower = filePath.toLowerCase();
  const extension = extname(lower);
  if (OCR_TEXT_PATTERN.test(lower)) return 'ocr_text';
  if (TEXT_EXTENSIONS.has(extension)) return 'text';
  if (EPUB_EXTENSIONS.has(extension)) return 'epub';
  if (PDF_EXTENSIONS.has(extension)) return 'pdf';
  return 'unknown';
}

function isWithinRoot(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function resolveRootSuffixPath(root, requestPath) {
  const requestParts = requestPath.replace(/\\/g, '/').split('/').filter(Boolean);
  const rootParts = root.replace(/\\/g, '/').split('/').filter(Boolean);
  const maxTail = Math.min(requestParts.length, rootParts.length);
  for (let tailSize = maxTail; tailSize > 0; tailSize -= 1) {
    const rootTail = rootParts.slice(-tailSize).join('/');
    const requestHead = requestParts.slice(0, tailSize).join('/');
    if (rootTail !== requestHead) continue;
    const stripped = requestParts.slice(tailSize).join('/');
    const candidate = resolve(root, stripped);
    if (isWithinRoot(root, candidate)) return candidate;
  }
  return null;
}

function resolveDocumentPath(dataRoot, requestPath) {
  if (!requestPath) {
    throw new Error('Missing document path.');
  }
  const root = resolve(dataRoot);
  if (isAbsolute(requestPath)) {
    const absoluteCandidate = resolve(requestPath);
    if (!isWithinRoot(root, absoluteCandidate)) {
      throw new Error('Document path is outside the configured data folder.');
    }
    return absoluteCandidate;
  }
  const cwdCandidate = resolve(process.cwd(), requestPath);
  if (isWithinRoot(root, cwdCandidate)) {
    return cwdCandidate;
  }
  const suffixCandidate = resolveRootSuffixPath(root, requestPath);
  if (suffixCandidate) {
    return suffixCandidate;
  }
  const rootCandidate = resolve(root, requestPath);
  if (isWithinRoot(root, rootCandidate)) {
    return rootCandidate;
  }
  throw new Error('Document path is outside the configured data folder.');
}

function documentUrlPath(req) {
  return new URL(req.url || '/', DEFAULT_LISTEN_URL).searchParams.get('path') || '';
}

async function sha256(filePath) {
  return await new Promise((resolveHash, rejectHash) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', rejectHash);
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

async function documentStatus(dataRoot, requestPath) {
  const filePath = resolveDocumentPath(dataRoot, requestPath);
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    throw new Error('Document path is not a file.');
  }
  return {
    ok: true,
    path: filePath,
    name: basename(filePath),
    sizeBytes: fileStat.size,
    modifiedAt: fileStat.mtime.toISOString(),
    contentType: contentTypeFromPath(filePath),
    contentKind: contentKindFromPath(filePath),
    sha256: await sha256(filePath),
  };
}

async function listDocuments(dataRoot, startPath = '') {
  const root = resolve(dataRoot);
  const start = startPath ? resolveDocumentPath(root, startPath) : root;
  const entries = await readdir(start, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const absolutePath = join(start, entry.name);
    if (!isWithinRoot(root, absolutePath)) continue;
    if (entry.isDirectory()) {
      files.push(...await listDocuments(root, absolutePath));
    } else if (entry.isFile()) {
      const fileStat = await stat(absolutePath);
      files.push({
        path: absolutePath,
        relativePath: relative(root, absolutePath).split(sep).join('/'),
        name: entry.name,
        sizeBytes: fileStat.size,
        modifiedAt: fileStat.mtime.toISOString(),
        contentType: contentTypeFromPath(absolutePath),
        contentKind: contentKindFromPath(absolutePath),
      });
    }
  }
  return files;
}

async function readJsonBody(req) {
  const raw = await readBody(req);
  if (!raw.length) return {};
  return JSON.parse(raw.toString('utf8'));
}

function openFile(filePath) {
  const command = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'explorer.exe'
      : 'xdg-open';
  const args = [filePath];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

function runProcess(command, args, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      rejectRun(new Error(`${command} timed out`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timeout);
      rejectRun(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      const output = Buffer.concat(stdout);
      if (code === 0) {
        resolveRun(output);
        return;
      }
      rejectRun(new Error(Buffer.concat(stderr).toString('utf8') || `${command} exited with ${code}`));
    });
  });
}

async function pdfKitHelperPath(dataRoot) {
  if (process.platform !== 'darwin') {
    throw new Error('PDF text extraction is unavailable on this platform.');
  }
  const root = resolve(dataRoot);
  const cached = pdfKitHelperCache.get(root);
  if (cached) return cached;
  const promise = (async () => {
    const bridgeDir = await mkdtemp(join(tmpdir(), 'difficulty-engine-pdfkit-'));
    const sourcePath = join(bridgeDir, 'pdfkit-text-extract.swift');
    const binaryPath = join(bridgeDir, 'pdfkit-text-extract');
    await writeFile(sourcePath, PDFKIT_HELPER_SOURCE, 'utf8');
    await runProcess('/usr/bin/swiftc', ['-framework', 'PDFKit', sourcePath, '-o', binaryPath], PDF_TEXT_TIMEOUT_MS);
    return binaryPath;
  })();
  pdfKitHelperCache.set(root, promise);
  return promise;
}

async function extractPdfText(dataRoot, filePath) {
  const helperPath = await pdfKitHelperPath(dataRoot);
  const output = await runProcess(
    helperPath,
    [filePath, String(PDF_TEXT_PAGE_LIMIT)],
    PDF_TEXT_TIMEOUT_MS,
  );
  const text = output.toString('utf8').trim();
  if (!text) {
    throw new Error('PDF contains no extractable embedded text in the scanned page range.');
  }
  return text;
}

async function handleDocumentRequest(req, res, dataRoot, allowedOrigins = DEFAULT_ALLOWED_ORIGINS) {
  const pathname = new URL(req.url || '/', DEFAULT_LISTEN_URL).pathname;
  try {
    if (pathname === '/documents/list' && req.method === 'GET') {
      const items = await listDocuments(dataRoot, documentUrlPath(req));
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: true, dataRoot: resolve(dataRoot), items }));
      return true;
    }
    if (pathname === '/documents/status' && req.method === 'GET') {
      const payload = await documentStatus(dataRoot, documentUrlPath(req));
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(payload));
      return true;
    }
    if (pathname === '/documents/read-text' && req.method === 'GET') {
      const filePath = resolveDocumentPath(dataRoot, documentUrlPath(req));
      const lower = filePath.toLowerCase();
      if (PDF_EXTENSIONS.has(extname(lower))) {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(await extractPdfText(dataRoot, filePath));
        return true;
      }
      if (!TEXT_EXTENSIONS.has(extname(lower)) && !OCR_TEXT_PATTERN.test(lower)) {
        throw new Error('Only text documents can be read as text.');
      }
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(await readFile(filePath, 'utf8'));
      return true;
    }
    if (pathname === '/documents/read-bytes' && req.method === 'GET') {
      const filePath = resolveDocumentPath(dataRoot, documentUrlPath(req));
      res.setHeader('Content-Type', contentTypeFromPath(filePath));
      res.end(await readFile(filePath));
      return true;
    }
    if (pathname === '/documents/open' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const filePath = resolveDocumentPath(dataRoot, String(body.path || ''));
      await stat(filePath);
      openFile(filePath);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: true, path: filePath }));
      return true;
    }
    return false;
  } catch (error) {
    writeBridgeError(req, res, 400, error instanceof Error ? error.message : String(error), allowedOrigins);
    return true;
  }
}

export function createQbittorrentBridgeServer({
  listenUrl = DEFAULT_LISTEN_URL,
  targetBaseUrl = DEFAULT_TARGET_URL,
  dataRoot = DEFAULT_DATA_ROOT,
  fetchImpl = globalThis.fetch.bind(globalThis),
  timeoutMs = DEFAULT_TIMEOUT_MS,
  allowedOrigins = DEFAULT_ALLOWED_ORIGINS,
} = {}) {
  let sessionCookie = '';
  const cleanTargetBaseUrl = trimBaseUrl(targetBaseUrl);
  const cleanDataRoot = resolve(dataRoot);
  const cleanAllowedOrigins = allowedOrigins.length ? allowedOrigins : [...DEFAULT_ALLOWED_ORIGINS];
  const server = createServer(async (req, res) => {
    if (rejectDisallowedOrigin(req, res, cleanAllowedOrigins)) return;
    setCors(req, res, cleanAllowedOrigins);
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const pathname = new URL(req.url || '/', listenUrl).pathname;
    if (pathname === '/__health') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        ok: true,
        targetBaseUrl: cleanTargetBaseUrl,
        dataRoot: cleanDataRoot,
        allowedOrigins: cleanAllowedOrigins,
      }));
      return;
    }
    if (pathname.startsWith('/documents/')) {
      if (await handleDocumentRequest(req, res, cleanDataRoot, cleanAllowedOrigins)) return;
    }
    if (!pathname.startsWith('/api/v2/')) {
      res.statusCode = 302;
      res.setHeader('Location', cleanTargetBaseUrl);
      res.end();
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const body = req.method === 'GET' || req.method === 'HEAD'
        ? undefined
        : await readBody(req);
      const upstream = await fetchImpl(targetUrl(cleanTargetBaseUrl, req.url), {
        method: req.method,
        headers: forwardHeaders(req, sessionCookie),
        body,
        signal: controller.signal,
      });

      const setCookie = upstream.headers.get('set-cookie');
      if (setCookie) sessionCookie = setCookie.split(';')[0] || sessionCookie;

      res.statusCode = upstream.status;
      upstream.headers.forEach((value, key) => {
        if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      });
      setCors(req, res, cleanAllowedOrigins);
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      writeBridgeError(req, res, 502, message || 'qBittorrent bridge request failed', cleanAllowedOrigins);
    } finally {
      clearTimeout(timeout);
    }
  });
  return server;
}

async function main() {
  const listenUrl = trimBaseUrl(argValue('--listen', process.env.QBITTORRENT_BRIDGE_URL || DEFAULT_LISTEN_URL));
  const targetBaseUrl = trimBaseUrl(argValue('--target', process.env.QBITTORRENT_URL || DEFAULT_TARGET_URL));
  const dataRoot = resolve(argValue('--data-root', process.env.QBITTORRENT_DATA_ROOT || DEFAULT_DATA_ROOT));
  const timeoutMs = Number(argValue('--timeout-ms', String(DEFAULT_TIMEOUT_MS))) || DEFAULT_TIMEOUT_MS;
  const allowedOrigins = parseAllowedOrigins(argValue('--allowed-origin', process.env.QBITTORRENT_BRIDGE_ALLOWED_ORIGINS || ''));
  await mkdir(dataRoot, { recursive: true });
  const listen = new URL(listenUrl);
  const server = createQbittorrentBridgeServer({ listenUrl, targetBaseUrl, dataRoot, timeoutMs, allowedOrigins });
  await new Promise((resolveListen) => {
    server.listen(Number(listen.port || 80), listen.hostname, resolveListen);
  });
  process.stdout.write(`qBittorrent browser bridge listening at ${listenUrl}, forwarding to ${targetBaseUrl}\n`);
  process.stdout.write(`Document data root: ${dataRoot}\n`);
  process.stdout.write(`Allowed browser origins: ${allowedOrigins.join(', ')}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
