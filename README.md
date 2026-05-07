# Difficulty Engine

Difficulty Engine now ships as a typed, embeddable planner subsystem with one canonical project format, one canonical solver pipeline, and one canonical standalone build artifact.

## Tooling

- TypeScript with strict type-checking
- Svelte shell for the mounted app UI
- esbuild for single-file bundling
- ESLint + Prettier for guardrails
- Vitest for unit/integration tests
- Playwright for browser smoke coverage

## Source layout

- `src/core/`: pure planner engine, typed models, diagnostics, and render-model derivation
- `src/app/`: store, mount lifecycle, and command-style mutations
- `src/ui/`: Svelte shell plus focused DOM/SVG panel helpers
- `src/infra/`: enrichment client, logging, and persistence adapters
- `src/index.ts`: embeddable public API surface
- `src/styles/app.css`: canonical design tokens and layout styles
- `src/template/index.html`: HTML shell used by the bundler

## Public API

The library entrypoint exports:

- `createPlannerEngine`
- `createPlannerStore`
- `mountPlannerApp`
- `createEnrichmentClient`
- public type exports from `src/core/types.ts`

## Difficulty model

The planner separates workload truth from presentation:

- `scheduleDifficulty` is the solver input used for minutes/page, feasibility, scheduling, and day plans.
- `displayDifficulty` is only for charts, labels, colors, and explanation.
- Difficulty is estimated from evidence first: seed difficulty, page burden, topic density/rarity, technical density, chapter/TOC quality, metadata confidence, graph prerequisites, learner profile, and logged actual reading pace.
- Page targets are also staged: desired pages/day, feasible page range, and final allocated pages/day. If a hard constraint binds, the snapshot explains the binding reason.

This split is intentional. Display compression can make the UI easier to read, but it must not change hours, finish date, or calendar allocation.

## Commands

```bash
npm install
npm run build
npm run dev
npm run check
npm run toc:audit
npm run test:e2e
python3 scripts/audit_source.py
```

The production artifact is written to `dist/difficulty_engine.html`.

For AI-assisted or large maintenance edits, follow `CHANGE_GUIDE.md` first. It lists the canonical owners for controls, formatting, matching, document ranking, source masks, and wiring so new code does not reimplement local copies of existing patterns.

Large-project computes may use the worker-backed `PlannerComputeAdapter`. Store commands must still commit project changes synchronously so persistence and embedded hosts never wait on worker results before seeing the latest project state.

## TOC sourcing

TOC extraction prefers trusted local document evidence before online snippets: manual chapters, completed text/EPUB/OCR text, local PDF outline/raw bytes, bridge-backed embedded text, optional bridge OCR, then provider metadata. Bare `Contents` headings are used only to find TOC regions and are not stored as chapters.

`npm run toc:audit` runs synthetic TOC fixtures and any local files under `output/data/documents`. It fails on fixture recall below the target or known garbage chapters, and it labels local misses as needing embedded text/OCR instead of silently accepting noisy PDF bytes.

## Local AI keys

For local development, place AI credentials in `.env`:

```bash
DIFFICULTY_ENGINE_AI_PROVIDER=openai
DIFFICULTY_ENGINE_AI_MODEL=gpt-5-mini
DIFFICULTY_ENGINE_AI_API_KEY=your-key-here
```

`npm run dev` reads `.env` when serving the local app. `npm run build` does not bundle `.env`
values unless `DIFFICULTY_ENGINE_BUNDLE_ENV=1` is explicitly set, because the output HTML is a
client-side file and any bundled key is visible to anyone with that file.
