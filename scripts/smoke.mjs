import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { sveltePlugin } from './svelte-esbuild-plugin.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distFile = resolve(rootDir, 'dist', 'difficulty_engine.html');
const libraryEntry = resolve(rootDir, 'src', 'index.ts');
const port = 4184;

function buildIfNeeded() {
  return new Promise((resolveBuild, rejectBuild) => {
    const child = spawn(
      process.execPath,
      [resolve(rootDir, 'scripts', 'build.mjs')],
      {
        cwd: rootDir,
        stdio: 'inherit',
      },
    );
    child.on('exit', (code) => {
      if (code === 0) resolveBuild(undefined);
      else rejectBuild(new Error(`build failed with code ${code}`));
    });
  });
}

async function main() {
  await buildIfNeeded();
  const html = await readFile(distFile, 'utf8');
  const libraryBundle = await build({
    entryPoints: [libraryEntry],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    write: false,
    sourcemap: false,
    plugins: [sveltePlugin()],
  });
  const embedJs = libraryBundle.outputFiles[0]?.text ?? '';
  const embeddedHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Difficulty Engine Embed Smoke</title>
  </head>
  <body>
    <h1>Host integration</h1>
    <div id="embed-root"></div>
    <script type="module">
      import { mountPlannerApp } from '/embed.js';

      const logger = {
        debug() {},
        info() {},
        warn() {},
        error() {},
      };

      const clock = {
        now() { return new Date('2026-01-05T00:00:00.000Z'); },
        timelineStart(project) { return new Date(\`\${project.constraints.sd}T12:00:00.000Z\`); },
        slotToDate(slot, start) {
          const next = new Date(start);
          next.setUTCDate(next.getUTCDate() + Math.max(0, Math.round(slot || 0)));
          return next;
        },
        dateKey(date) { return date.toISOString().slice(0, 10); },
        totalTimelineSlots(project) { return Math.round(project.constraints.tl * 30.44); },
        realWeeks(project) { return project.constraints.tl * 4.345; },
      };

      const enrichmentProvider = {
        async fetchBook({ book }) {
          return {
            cacheKey: book.id,
            bookPatch: {
              pages: book.pages,
              subjects: [...book.subjects, 'smoke'],
            },
            enrichment: {
              ...book.enrichment,
              olSubjects: [...book.enrichment.olSubjects, 'smoke'],
            },
            provenance: [{ provider: 'smoke', fetchedAt: new Date('2026-01-05T00:00:00.000Z').toISOString(), confidence: 1 }],
          };
        },
        async searchBooks() {
          return {
            results: [
              {
                key: 'smoke-search',
                title: 'Smoke Search Result',
                authors: ['Smoke Searcher'],
                subtitle: 'Smoke Searcher · 2026',
                isbn: '9781111111111',
                year: 2026,
                publisher: 'Smoke Press',
                subjects: ['testing'],
                description: 'Smoke suggestion from the embedded provider.',
                pages: 240,
              },
            ],
            hasMore: false,
            nextOffset: 1,
            mode: 'search',
          };
        },
      };

      const project = {
        version: 1,
        library: {
          books: {
            intro: {
              id: 'intro',
              title: 'Embedded Planning Book',
              short: 'Embedded Book',
              authors: ['Smoke Test'],
              displayGroup: 'Core',
              manualSeedDifficulty: 4,
              pages: 180,
              subjects: ['testing'],
              publisher: '',
              isbn: null,
              year: 2026,
              manualPrereqs: [],
              manualCoStudy: [],
              allowPrereqOverlap: false,
              lockDiff: false,
              noPropOut: false,
              ignored: false,
              constantRD: false,
              completed: false,
              enrichment: {
                chapters: ['Intro', 'Practice'],
                description: 'A small embedded smoke-test book.',
                olSubjects: ['testing'],
                tocSource: 'manual',
              },
            },
            advanced: {
              id: 'advanced',
              title: 'Embedded Applied Planning',
              short: 'Applied Plan',
              authors: ['Smoke Test'],
              displayGroup: 'Applied',
              manualSeedDifficulty: 6,
              pages: 320,
              subjects: ['testing', 'planning', 'advanced'],
              publisher: '',
              isbn: null,
              year: 2026,
              manualPrereqs: [],
              manualCoStudy: [],
              allowPrereqOverlap: false,
              lockDiff: false,
              noPropOut: false,
              ignored: false,
              constantRD: false,
              completed: false,
              enrichment: {
                chapters: ['Review', 'Applied planning', 'Advanced practice'],
                description: 'Builds on introductory planning concepts before moving into applied planning.',
                olSubjects: ['planning'],
                tocSource: 'manual',
              },
            },
          },
        },
        manualOverrides: { schedule: {}, deferred: {} },
        constraints: {
          damp: 0.35, gam: 1.5, mode: 'difficulty', tl: 12, par: 2, hpd: 2, dpw: 5, pt: 0.3, bmp: 20,
          sd: '2026-01-05', minPg: 7, maxPg: 24, schedAlgo: 'balanced',
          relativePacingStrength: 50, relativePacingCurve: 'smoothstep',
          feasibilityMode: 'practical', backfillMode: 'global', prereqMode: 'strict',
          skimRatio: 0.35, prereqRetention: 0.45, propLiftCap: 2.2, propMix: 0.65, propBreadth: 0.12, propNovelty: 0.18,
          blendMode: 'geometric', alphaCap: 0.5, absFloor: 0.55, compressMode: 'auto', compressExp: 0.65,
          diffMapMode: 'raw', diffMapMin: 2, diffMapMax: 9, diffRamp: 1,
          applyOverlapSkim: true, boostUnused: true, boostStrength: 1, mutualEnabled: true, mutualOversize: 'batch',
          autoRD: false, rdMinChain: 4, rdMinSlope: 0.35, tr: true, part: false, excComp: true,
          displayGroups: { Core: 1, Supporting: 1 }, studyWeekdays: [1,2,3,4,5], weekdaysCustom: false,
        },
        enrichmentCache: {},
        uiPreferences: { ganttView: 'plan', ganttZoom: 1, planColorMode: 'category_mono' },
      };

      await mountPlannerApp({
        container: document.getElementById('embed-root'),
        initialProject: project,
        enrichmentProvider,
        logger,
        clock,
      });
      window.__embedReady = true;
    </script>
  </body>
</html>`;
  const server = createServer((req, res) => {
    if (req.url === '/embed.js') {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.end(embedJs);
      return;
    }
    if (req.url === '/embedded') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(embeddedHtml);
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  });

  await new Promise((resolveServer) =>
    server.listen(port, '127.0.0.1', resolveServer),
  );

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error));

  try {
    await page.goto(`http://127.0.0.1:${port}`);
    await page.getByRole('heading', { name: 'Study Planner' }).waitFor();
    await page.getByRole('button', { name: 'Add book' }).click();
    await page.getByText('Book 1').waitFor();
    await page
      .locator('.book-list-item')
      .filter({ hasText: 'Book 1' })
      .first()
      .click();
    const titleInput = page.locator('[data-focus-key="book:book-1:title"]');
    await titleInput.waitFor();
    await titleInput.click();
    await titleInput.fill('Smoke Edited Title');
    await page.waitForFunction(
      () =>
        document.activeElement instanceof HTMLElement &&
        document.activeElement.dataset.focusKey === 'book:book-1:title',
    );
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Planner Settings' })
      .click();
    await page.getByRole('heading', { name: 'Plan Window' }).waitFor();
    await page.getByText('Target end date').waitFor();
    await page
      .getByRole('navigation')
      .getByRole('button', { name: 'Plan', exact: true })
      .click();
    await page.getByRole('heading', { name: 'Gantt timeline' }).waitFor();
    await page.getByLabel('Plan color mode').selectOption('detected_genre');
    await page.getByRole('button', { name: '+' }).first().click();
    const standaloneCalendarCell = page
      .locator('.calendar-day-cell.has-work')
      .first();
    await standaloneCalendarCell.waitFor();
    await standaloneCalendarCell.click({ position: { x: 8, y: 8 } });
    const progressPanel = page
      .locator('.planner-side-column .calendar-log-panel')
      .first();
    await progressPanel.waitFor();
    await progressPanel.getByLabel(/Actual pages for/).fill('3.5');
    await progressPanel.getByLabel(/Actual pages for/).press('Tab');
    await progressPanel.getByRole('button', { name: 'Mark done' }).click();
    await progressPanel.getByRole('button', { name: 'Done' }).waitFor();

    await page.goto(`http://127.0.0.1:${port}/embedded`);
    await page.getByRole('heading', { name: 'Host integration' }).waitFor();
    await page.waitForFunction(() => window.__embedReady === true);
    await page.locator('#embed-root .app-shell').waitFor();
    await page
      .locator('#embed-root')
      .getByRole('navigation')
      .getByRole('button', { name: 'Plan', exact: true })
      .click();
    const quickAddCard = page
      .locator('#embed-root .card')
      .filter({ hasText: 'Quick add' })
      .first();
    await quickAddCard
      .getByPlaceholder('Search by title, author, or ISBN...')
      .fill('smoke');
    await quickAddCard.getByRole('button', { name: 'Search' }).click();
    await quickAddCard.getByText('Smoke Search Result').waitFor();
    await quickAddCard
      .locator('.search-result-card')
      .filter({ hasText: 'Smoke Search Result' })
      .getByRole('button', { name: 'Add' })
      .click();
    await page
      .locator('#embed-root')
      .getByRole('navigation')
      .getByRole('button', { name: 'Library' })
      .click();
    await page
      .locator('#embed-root .book-list-item')
      .filter({ hasText: 'Smoke Search Result' })
      .first()
      .waitFor();
    await page
      .locator('#embed-root')
      .getByRole('navigation')
      .getByRole('button', { name: 'Plan', exact: true })
      .click();
    await quickAddCard.getByText('Smoke Search Result').waitFor();
    await quickAddCard.getByRole('button', { name: 'Select' }).first().click();
    await page
      .locator('#embed-root')
      .getByRole('navigation')
      .getByRole('button', { name: 'Library' })
      .click();
    const searchResultRows = page
      .locator('#embed-root .book-list-item')
      .filter({ hasText: 'Smoke Search Result' });
    if ((await searchResultRows.count()) !== 1) {
      throw new Error(
        'Duplicate search result book was added to the embedded library.',
      );
    }
    await page
      .locator('#embed-root')
      .getByRole('navigation')
      .getByRole('button', { name: 'Graphs' })
      .click();
    await page
      .locator('#embed-root')
      .getByRole('heading', { name: 'Prerequisite DAG' })
      .waitFor();
    await page.waitForFunction(() =>
      Boolean(document.querySelector('#embed-root svg.graph-svg [marker-end]')),
    );
    const graphCard = page
      .locator('#embed-root .card')
      .filter({ hasText: 'Prerequisite DAG' })
      .first();
    await graphCard.getByRole('button', { name: '+' }).click();
    await page.waitForFunction(() => {
      const content = document.querySelector(
        '#embed-root .graph-viewport-content',
      );
      return Boolean(content && getComputedStyle(content).transform !== 'none');
    });
    await page
      .locator('#embed-root')
      .getByRole('navigation')
      .getByRole('button', { name: 'Guide' })
      .click();
    await page
      .locator('#embed-root')
      .getByRole('heading', { name: 'Difficulty Engine Guide' })
      .waitFor();
    await page
      .locator('#embed-root')
      .getByRole('navigation')
      .getByRole('button', { name: 'Project' })
      .click();
    const projectArea = page.locator(
      '#embed-root [data-focus-key="project:json"]',
    );
    const projectJson = await projectArea.inputValue();
    await projectArea.fill(
      projectJson.replace(
        'Embedded Planning Book',
        'Embedded Planning Book Updated',
      ),
    );
    await page
      .locator('#embed-root')
      .getByRole('button', { name: 'Load JSON from editor' })
      .click();
    await page
      .locator('#embed-root')
      .getByRole('navigation')
      .getByRole('button', { name: 'Library' })
      .click();
    await page.waitForFunction(() => {
      const input = document.querySelector(
        '#embed-root [data-focus-key="book:intro:title"]',
      );
      return (
        input instanceof HTMLInputElement &&
        input.value === 'Embedded Planning Book Updated'
      );
    });
    await page
      .locator('#embed-root')
      .getByRole('navigation')
      .getByRole('button', { name: 'Plan', exact: true })
      .click();
    await page
      .locator('#embed-root')
      .getByRole('heading', { name: 'Gantt timeline' })
      .waitFor();
    if (pageErrors.length) {
      throw pageErrors[0];
    }
    process.stdout.write(
      'Browser smoke passed for standalone and embedded mount.\n',
    );
  } finally {
    await browser.close();
    await new Promise((resolveServer) => server.close(resolveServer));
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exitCode = 1;
});
