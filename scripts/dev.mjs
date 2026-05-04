import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { spawn } from 'node:child_process';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distFile = resolve(rootDir, 'dist', 'difficulty_engine.html');
const port = 4173;

function rebuild() {
  return new Promise((resolveBuild, rejectBuild) => {
    const child = spawn(process.execPath, [resolve(rootDir, 'scripts', 'build.mjs')], {
      cwd: rootDir,
      stdio: 'inherit',
    });
    child.on('exit', (code) => {
      if (code === 0) resolveBuild(undefined);
      else rejectBuild(new Error(`build failed with code ${code}`));
    });
  });
}

const server = createServer(async (_req, res) => {
  const html = await readFile(distFile, 'utf8');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
});

rebuild()
  .then(() => {
    server.listen(port, '127.0.0.1', () => {
      process.stdout.write(`Preview at http://127.0.0.1:${port}\n`);
    });
  })
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
