import { compile } from 'svelte/compiler';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export function sveltePlugin() {
  return {
    name: 'difficulty-engine-svelte',
    setup(build) {
      build.onLoad({ filter: /\.svelte$/ }, async (args) => {
        const source = await readFile(args.path, 'utf8');
        const compiled = compile(source, {
          filename: args.path,
          generate: 'client',
          css: 'injected',
          dev: false,
          runes: true,
        });
        return {
          contents: compiled.js.code,
          loader: 'js',
          resolveDir: dirname(args.path),
        };
      });
    },
  };
}
