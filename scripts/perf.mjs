import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const rootDir = resolve(new URL('..', import.meta.url).pathname);
const ciMode = process.argv.includes('--ci');
const sizesArg = process.argv.find((arg) => arg.startsWith('--sizes='));
const sizes = sizesArg
  ? sizesArg
      .slice('--sizes='.length)
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value > 0)
  : [50, 200, 500, 1000];
const budgets = new Map([
  [50, 700],
  [200, 2200],
  [500, 8000],
  [1000, 45000],
]);

const source = `
import { createPlannerEngine } from './src/core/engine';
import { createEmptyProject } from './src/core/project-file';
import { createDefaultSourceSettings } from './src/core/default-source-settings';
import { createDefaultAiRecommendationSettings } from './src/core/default-project';

const logger = { debug(){}, info(){}, warn(){}, error(){} };

function makeBook(index) {
  const cluster = index % 10;
  return {
    id: \`book-\${index}\`,
    title: \`Synthetic Technical Book \${index}\`,
    short: \`Synthetic \${index}\`,
    authors: [\`Author \${cluster}\`],
    pages: 80 + (index % 7) * 10,
    manualSeedDifficulty: 3 + (index % 6),
    displayGroup: \`Cluster \${cluster}\`,
    subjects: [\`topic-\${cluster}\`, \`method-\${index % 17}\`],
    topics: [\`topic-\${cluster}\`, \`method-\${index % 17}\`, \`tool-\${index % 23}\`],
    publisher: 'Synthetic Press',
    isbn: null,
    year: 2026,
    manualPrereqs: index > 0 && index % 5 === 0 ? [\`book-\${index - 1}\`] : [],
    manualCoStudy: [],
    owned: true,
    planOrder: index,
    allowPrereqOverlap: false,
    lockDiff: false,
    noPropOut: false,
    ignored: false,
    constantRD: false,
    completed: false,
    enrichment: {
      chapters: Array.from({ length: 8 }, (_, chapter) =>
        \`Chapter \${chapter + 1}: Topic \${cluster} Method \${(index + chapter) % 17}\`,
      ),
      description: \`A synthetic technical text covering topic \${cluster}, method \${index % 17}, and tool \${index % 23}.\`,
      olSubjects: [\`topic-\${cluster}\`],
      tocSource: 'synthetic',
    },
  };
}

function makeProject(size) {
  const empty = createEmptyProject();
  const books = Object.fromEntries(
    Array.from({ length: size }, (_, index) => {
      const book = makeBook(index + 1);
      return [book.id, book];
    }),
  );
  return {
    ...empty,
    library: { books },
    constraints: {
      ...empty.constraints,
      sd: '2026-01-05',
      par: 4,
      hpd: 8,
      minPg: 2,
      maxPg: 50,
      tl: 18,
      schedulerStrategy: 'fastest',
      feasibilityMode: 'relaxed',
    },
    sourceSettings: createDefaultSourceSettings(),
    aiRecommendationSettings: createDefaultAiRecommendationSettings(),
  };
}

export function runOne(size) {
  const engine = createPlannerEngine({ logger });
  const project = makeProject(size);
  const startedAt = performance.now();
  const snapshot = engine.computeSnapshot(project);
  return {
    size,
    ms: Math.round((performance.now() - startedAt) * 10) / 10,
    relations: snapshot.relations.length,
    scheduled: snapshot.schedulePlan.items.length,
    warnings: snapshot.renderModel.warnings.length,
  };
}
`;

async function main() {
  const tmpDir = await mkdtemp(join(tmpdir(), 'difficulty-engine-perf-'));
  const outfile = join(tmpDir, 'perf-entry.mjs');
  try {
    const bundle = await build({
      stdin: {
        contents: source,
        resolveDir: rootDir,
        sourcefile: 'perf-entry.ts',
        loader: 'ts',
      },
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      write: false,
    });
    await writeFile(outfile, bundle.outputFiles[0]?.text ?? '', 'utf8');
    const module = await import(pathToFileURL(outfile).href);
    for (const size of sizes) {
      const row = module.runOne(size);
      process.stdout.write(
        `${row.size} books: ${row.ms}ms, ${row.relations} relations, ${row.scheduled} scheduled, ${row.warnings} warnings\n`,
      );
      if (ciMode && row.ms > (budgets.get(row.size) ?? Infinity)) {
        throw new Error(
          `Performance budget exceeded for ${row.size} books: ${row.ms}ms`,
        );
      }
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
