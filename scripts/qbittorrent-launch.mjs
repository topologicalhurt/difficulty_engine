import { spawn } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_URL = 'http://127.0.0.1:8080';
const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:8787';
const DEFAULT_DATA_ROOT = resolve(process.cwd(), 'data', 'documents');
const DEFAULT_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 900;
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATHS = [
  join(homedir(), '.config', 'qBittorrent', 'qBittorrent.ini'),
  join(homedir(), '.config', 'qBittorrent', 'qBittorrent.conf'),
];
const DEFAULT_WEBUI_USERNAME = 'admin';
const DEFAULT_WEBUI_PASSWORD = 'adminadmin';
const DEFAULT_WEBUI_PASSWORD_PBKDF2 =
  '"@ByteArray(ARQ77eY1NUZaQsuDHbIMCA==:0WMRkYTUWVT9wVvdDtHAjU9b3b7uB8NR1Gur2hmQCvCDpm39Q+PsJRJPaCU51dEiz+dTzh8qbPsL8WkFljQYFQ==)"';

function argValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function run(command, args, stdio = 'ignore') {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { stdio });
    child.on('error', () => resolveRun(false));
    child.on('exit', (code) => resolveRun(code === 0));
  });
}

function runWithTimeout(command, args, timeoutMs) {
  return new Promise((resolveRun) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      resolveRun(false);
    }, timeoutMs);
    child.on('error', () => {
      clearTimeout(timeout);
      resolveRun(false);
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);
      resolveRun(code === 0);
    });
  });
}

function commandOutput(command, args) {
  return new Promise((resolveOutput) => {
    let output = '';
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      output += String(chunk);
    });
    child.on('error', () => resolveOutput(''));
    child.on('exit', () => resolveOutput(output));
  });
}

function webUiConfigPath() {
  return CONFIG_PATHS.find((path) => existsSync(path)) ?? CONFIG_PATHS[0];
}

function urlParts(baseUrl) {
  const url = new URL(baseUrl);
  return {
    host: url.hostname === 'localhost' ? '127.0.0.1' : url.hostname,
    port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
  };
}

function setPreference(lines, key, value) {
  const preferencesIndex = lines.findIndex((line) => line.trim() === '[Preferences]');
  const insertBase = preferencesIndex >= 0 ? preferencesIndex : lines.length;
  if (preferencesIndex < 0) {
    if (lines.length && lines[lines.length - 1] !== '') lines.push('');
    lines.push('[Preferences]');
  }
  const start = preferencesIndex >= 0 ? preferencesIndex + 1 : insertBase + 1;
  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    if (/^\[[^\]]+\]$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  const existingIndex = lines.findIndex((line, index) => index >= start && index < end && line.startsWith(`${key}=`));
  if (existingIndex >= 0) {
    lines[existingIndex] = `${key}=${value}`;
  } else {
    lines.splice(end, 0, `${key}=${value}`);
  }
}

async function configureWebUi(baseUrl) {
  const configPath = webUiConfigPath();
  await mkdir(dirname(configPath), { recursive: true });
  const existing = existsSync(configPath) ? await readFile(configPath, 'utf8') : '[Preferences]\n';
  if (existsSync(configPath)) {
    const backupPath = `${configPath}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    await copyFile(configPath, backupPath);
    process.stdout.write(`Backed up qBittorrent config to ${backupPath}\n`);
  }
  const { host, port } = urlParts(baseUrl);
  const lines = existing.split(/\r?\n/);
  setPreference(lines, 'WebUI\\Enabled', 'true');
  setPreference(lines, 'WebUI\\Address', host);
  setPreference(lines, 'WebUI\\Port', String(port));
  setPreference(lines, 'WebUI\\LocalHostAuth', 'false');
  setPreference(lines, 'WebUI\\UseUPnP', 'false');
  setPreference(lines, 'WebUI\\Username', DEFAULT_WEBUI_USERNAME);
  setPreference(lines, 'WebUI\\Password_PBKDF2', DEFAULT_WEBUI_PASSWORD_PBKDF2);
  await writeFile(configPath, lines.join('\n'), 'utf8');
  process.stdout.write(`Enabled qBittorrent Web UI at ${baseUrl} in ${configPath}\n`);
  process.stdout.write(
    `Set initial Web UI credentials to ${DEFAULT_WEBUI_USERNAME}/${DEFAULT_WEBUI_PASSWORD}. Change them in qBittorrent after setup.\n`,
  );
}

async function quitApp() {
  if (process.platform !== 'darwin') return;
  const graceful = await runWithTimeout('osascript', ['-e', 'tell application "qBittorrent" to quit'], 2500);
  if (!graceful) {
    process.stdout.write('qBittorrent did not respond to AppleScript quit; sending SIGTERM to apply Web UI config.\n');
    const pids = (await commandOutput('pgrep', ['-f', '/Applications/qbittorrent.app/Contents/MacOS/qbittorrent']))
      .split(/\s+/)
      .filter(Boolean);
    await Promise.all(pids.map((pid) => run('kill', ['-TERM', pid])));
  }
  await new Promise((resolve) => {
    setTimeout(resolve, 2500);
  });
}

async function openUrl(url) {
  if (hasArg('--no-browser')) return;
  if (process.platform === 'darwin') {
    await run('open', [url]);
  } else if (process.platform === 'win32') {
    await run('cmd', ['/c', 'start', '', url]);
  } else {
    await run('xdg-open', [url]);
  }
}

async function bridgeResponds(bridgeUrl) {
  try {
    const response = await fetch(`${bridgeUrl}/__health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function startBridge(bridgeUrl, targetUrl, dataRoot, timeoutMs, allowedOrigin) {
  if (hasArg('--no-bridge')) return;
  if (await bridgeResponds(bridgeUrl)) {
    process.stdout.write(`qBittorrent browser bridge is reachable at ${bridgeUrl}.\n`);
    return;
  }

  const bridgeScript = join(SCRIPT_DIR, 'qbittorrent-bridge.mjs');
  const child = spawn(process.execPath, [
    bridgeScript,
    '--listen',
    bridgeUrl,
    '--target',
    targetUrl,
    '--data-root',
    dataRoot,
    '--timeout-ms',
    String(timeoutMs),
    '--allowed-origin',
    allowedOrigin,
  ], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await bridgeResponds(bridgeUrl)) {
      process.stdout.write(`Started qBittorrent browser bridge at ${bridgeUrl}.\n`);
      process.stdout.write(`Use ${bridgeUrl} as the app Web API URL; it forwards to ${targetUrl}.\n`);
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, POLL_INTERVAL_MS);
    });
  }
  throw new Error(`qBittorrent browser bridge did not respond at ${bridgeUrl}`);
}

async function launchApp(baseUrl) {
  if (hasArg('--no-launch')) return true;
  if (process.platform !== 'darwin') {
    process.stdout.write('Native app launch is only automated on macOS. Skipping app launch.\n');
    return true;
  }
  const { port } = urlParts(baseUrl);
  const candidates = ['qBittorrent', 'qbittorrent'];
  for (const appName of candidates) {
    if (await run('open', ['-ga', appName, '--args', `--webui-port=${port}`])) {
      process.stdout.write(`Opened ${appName}.\n`);
      return true;
    }
  }
  process.stdout.write('Could not open qBittorrent automatically. Open it from /Applications, then re-run this command.\n');
  return false;
}

async function diagnoseWebUi(baseUrl, lastError) {
  const configPath = webUiConfigPath();
  const config = existsSync(configPath) ? await readFile(configPath, 'utf8') : '';
  const webUiEnabled = /WebUI\\Enabled=true/i.test(config);
  const webUiPort = config.match(/WebUI\\Port=(\d+)/)?.[1];
  const torrentPort = config.match(/Session\\Port=(\d+)/)?.[1];
  const qbitProcesses = await commandOutput('pgrep', ['-fl', '[qQ]Bittorrent|[qQ]bittorrent']);

  process.stdout.write(`qBittorrent Web API did not respond at ${baseUrl}: ${lastError}\n`);
  if (qbitProcesses.trim()) process.stdout.write(`qBittorrent process is running:\n${qbitProcesses}`);
  if (torrentPort) process.stdout.write(`Detected torrenting port ${torrentPort}; this is not the Web UI/API port.\n`);
  if (!webUiEnabled) {
    process.stdout.write(
      `Web UI is not enabled in ${configPath}.\n` +
        `Run: npm run qbittorrent:launch -- --enable-webui --url ${baseUrl}\n`,
    );
  } else if (webUiPort) {
    process.stdout.write(`Config says Web UI port is ${webUiPort}. Use http://127.0.0.1:${webUiPort} in the Project tab.\n`);
  }
}

async function waitForWebApi(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/v2/app/version`);
      if (response.ok || response.status === 403) return true;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => {
      setTimeout(resolve, POLL_INTERVAL_MS);
    });
  }
  await diagnoseWebUi(baseUrl, lastError);
  return false;
}

async function login(baseUrl, username, password) {
  if (!username && !password) {
    const response = await fetch(`${baseUrl}/api/v2/app/version`);
    if (response.ok) return '';
  }
  const body = new URLSearchParams({ username, password });
  const response = await fetch(`${baseUrl}/api/v2/auth/login`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  const text = await response.text();
  if (!response.ok || (!cookie && !/Ok\./i.test(text))) {
    throw new Error(`qBittorrent login failed: HTTP ${response.status}`);
  }
  return cookie;
}

async function listPlugins(baseUrl, cookie) {
  const response = await fetch(`${baseUrl}/api/v2/search/plugins`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  if (!response.ok) {
    throw new Error(`Could not read search plugins: HTTP ${response.status}`);
  }
  return await response.json();
}

async function main() {
  const baseUrl = argValue('--url', process.env.QBITTORRENT_URL || DEFAULT_URL).replace(/\/+$/, '');
  const bridgeUrl = argValue('--bridge-url', process.env.QBITTORRENT_BRIDGE_URL || DEFAULT_BRIDGE_URL).replace(/\/+$/, '');
  const dataRoot = resolve(argValue('--data-root', process.env.QBITTORRENT_DATA_ROOT || DEFAULT_DATA_ROOT));
  const username = argValue('--username', process.env.QBITTORRENT_USERNAME || '');
  const password = argValue('--password', process.env.QBITTORRENT_PASSWORD || '');
  const timeoutMs = Number(argValue('--timeout-ms', String(DEFAULT_TIMEOUT_MS))) || DEFAULT_TIMEOUT_MS;
  const allowedOrigin = argValue(
    '--allowed-origin',
    process.env.QBITTORRENT_BRIDGE_ALLOWED_ORIGINS || 'http://127.0.0.1:*,http://localhost:*',
  );

  if (hasArg('--enable-webui')) {
    await quitApp();
    await configureWebUi(baseUrl);
  }
  await launchApp(baseUrl);
  await openUrl(baseUrl);
  if (!(await waitForWebApi(baseUrl, timeoutMs))) {
    process.exitCode = 1;
    return;
  }
  await startBridge(bridgeUrl, baseUrl, dataRoot, timeoutMs, allowedOrigin);

  process.stdout.write(`qBittorrent Web API is reachable at ${baseUrl}.\n`);
  const cookie = await login(baseUrl, username, password);
  const plugins = await listPlugins(baseUrl, cookie);
  process.stdout.write(`Search plugins available: ${plugins.length}\n`);
  plugins.forEach((plugin) => {
    process.stdout.write(` - ${plugin.enabled ? 'enabled' : 'disabled'} ${plugin.fullName || plugin.name}\n`);
  });
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
