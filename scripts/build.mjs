import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readRuntimeEnv,
  publicRuntimeEnvAssignment,
  RUNTIME_ENV_ASSIGNMENT,
} from './runtime-env.mjs';
import { sveltePlugin } from './svelte-esbuild-plugin.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distFile = resolve(rootDir, 'dist', 'difficulty_engine.html');
const entryFile = resolve(rootDir, 'src', 'main.ts');
const workerEntryFile = resolve(rootDir, 'src', 'app', 'planner-worker.ts');
const cssFile = resolve(rootDir, 'src', 'styles', 'app.css');
const templateFile = resolve(rootDir, 'src', 'template', 'index.html');

async function main() {
  const [bundle, workerBundle, css, template] = await Promise.all([
    build({
      entryPoints: [entryFile],
      bundle: true,
      minify: true,
      format: 'iife',
      platform: 'browser',
      target: 'es2022',
      write: false,
      sourcemap: false,
      plugins: [sveltePlugin()],
    }),
    build({
      entryPoints: [workerEntryFile],
      bundle: true,
      minify: true,
      format: 'iife',
      platform: 'browser',
      target: 'es2022',
      write: false,
      sourcemap: false,
    }),
    readFile(cssFile, 'utf8'),
    readFile(templateFile, 'utf8'),
  ]);
  const script = (bundle.outputFiles[0]?.text ?? '').replaceAll(
    '"legacy props"',
    '""',
  );
  const workerScript = workerBundle.outputFiles[0]?.text ?? '';
  const runtimeEnv =
    process.env.DIFFICULTY_ENGINE_BUNDLE_ENV === '1'
      ? publicRuntimeEnvAssignment(await readRuntimeEnv(rootDir))
      : RUNTIME_ENV_ASSIGNMENT;
  const html = template
    .replace('<!-- APP_STYLE -->', `<style>\n${css}\n</style>`)
    .replace(
      '<!-- APP_SCRIPT -->',
      `<script>\n${runtimeEnv}\nwindow.__DIFFICULTY_ENGINE_WORKER_SCRIPT__ = ${JSON.stringify(workerScript)};\n${script}\n</script>`,
    );

  await mkdir(resolve(rootDir, 'dist'), { recursive: true });
  await writeFile(distFile, html, 'utf8');
  process.stdout.write(`Built ${distFile}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
