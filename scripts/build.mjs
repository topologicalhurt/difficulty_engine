import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readRuntimeEnv,
  publicRuntimeEnvAssignment,
  RUNTIME_ENV_ASSIGNMENT,
} from './runtime-env.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distFile = resolve(rootDir, 'dist', 'difficulty_engine.html');
const entryFile = resolve(rootDir, 'src', 'main.ts');
const cssFile = resolve(rootDir, 'src', 'styles', 'app.css');
const templateFile = resolve(rootDir, 'src', 'template', 'index.html');

async function main() {
  const [bundle, css, template] = await Promise.all([
    build({
      entryPoints: [entryFile],
      bundle: true,
      minify: false,
      format: 'iife',
      platform: 'browser',
      target: 'es2022',
      write: false,
      sourcemap: false,
    }),
    readFile(cssFile, 'utf8'),
    readFile(templateFile, 'utf8'),
  ]);
  const script = bundle.outputFiles[0]?.text ?? '';
  const runtimeEnv =
    process.env.DIFFICULTY_ENGINE_BUNDLE_ENV === '1'
      ? publicRuntimeEnvAssignment(await readRuntimeEnv(rootDir))
      : RUNTIME_ENV_ASSIGNMENT;
  const html = template
    .replace('<!-- APP_STYLE -->', `<style>\n${css}\n</style>`)
    .replace(
      '<!-- APP_SCRIPT -->',
      `<script>\n${runtimeEnv}\n${script}\n</script>`,
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
