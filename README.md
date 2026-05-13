# Difficulty Engine

Difficulty Engine now ships as a typed, embeddable planner subsystem with one canonical project format, one canonical solver pipeline, and one canonical standalone build artifact.

## Tooling

- TypeScript with strict type-checking
- Svelte shell for the mounted app UI, with centralized collapsible/resizable panel primitives
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
- Difficulty is estimated from evidence first: seed difficulty, effective reading pages, topic density/rarity, technical density, chapter/TOC quality, metadata confidence, graph prerequisites, learner profile policy, and logged actual reading pace.
- Reading scope never deletes source metadata. Learned non-core sections such as TOC rows, appendices, indexes, solutions, and duplicate/reference material are classified separately and can reduce `effectiveReadingPages` only when section/page evidence is trusted.
- Title words such as “Introduction”, “Beginner”, “Advanced”, and “Expert” are local cohort cues only. They can adjust rank against a close same-topic comparator, but they do not globally make an unrelated technical book easy or hard.
- Learner profiles are bounded policy presets. They alter challenge, pacing spread, ramp shape, uncertainty tolerance, learner feedback strength, and prerequisite strictness bias without overriding manual locks or hard constraints.
- Day allocation uses a nonlinear per-book ramp: early sessions usually allocate less work, later sessions approach the base target, and very hard material dampens the ramp.
- Page targets are also staged: desired pages/day, feasible page range, and final allocated pages/day. If a hard constraint binds, the snapshot explains the binding reason.

This split is intentional. Display compression can make the UI easier to read, but it must not change hours, finish date, or calendar allocation.

## Autopilot And AI Context

The “solve this for me” autopilot is an optimization preview, not a silent mutator. The Project tab asks for goal, deadline, confidence, and hard-constraint answers, evaluates a bounded policy portfolio, shows the recommended plan plus Pareto alternatives, then waits for explicit apply. Proof labels are scoped: `optimal` means exact over the declared portfolio and deterministic planner model, not unbounded global RCPSP optimality. It must preserve manual progress, manual relations, manual schedule/defer overrides, and difficulty locks.

AI recommendations receive full non-secret planner context: books, relations, constraints, reading scope, progress summaries, plan summaries, difficulty evidence, document status labels, warnings, and the active learner profile. Requests must not include API keys, qBittorrent credentials, local filesystem paths, bridge settings, or full document text.

AI apply paths are separated by design:

- Book recommender proposals can add books, remove books, and place books in the reading order.
- Relationship proposals can reorder existing books and update prerequisite/co-study links.
- Autopilot applies planner constraint settings only.
- AI project setting suggestions are advisory until a dedicated settings command applies them.

## Commands

```bash
npm install
npm run build
npm run dev
npm run check
npm run stabilize
npm run perf:ci
npm run toc:audit
npm run qbit:search-audit
npm run test:e2e
python3 scripts/audit_source.py
```

The production artifact is written to `dist/difficulty_engine.html`.

For AI-assisted or large maintenance edits, follow `CHANGE_GUIDE.md` first. It lists the canonical owners for controls, formatting, matching, document ranking, source masks, and wiring so new code does not reimplement local copies of existing patterns.

Use `npm run stabilize` as the normal pre-merge gate. It runs the change-safety
map, lint/type/Svelte/test checks, the standalone build, source audit,
architecture report, and the browser smoke script. Run `npm run perf:ci`,
`npm run toc:audit`, and `npm run qbit:search-audit` after selector/worker,
document/TOC, or qBittorrent changes respectively. Repository-only git helpers
live under `tools/` and are documented there.

The Info tab renders its guide from a Markdown README source with the shared Markdown renderer; update that content instead of scattering explanatory cards through tab views.

Large-project computes may use the worker-backed `PlannerComputeAdapter`. Store commands must still commit project changes synchronously so persistence and embedded hosts never wait on worker results before seeing the latest project state.

Project saves are triggered by `project-changed` events. Local persistence keeps a known-good backup when backups are enabled, so project-mutating commands must not bypass the store runtime.

## TOC sourcing

TOC extraction prefers trusted local document evidence before online snippets: manual chapters, completed text/EPUB/OCR text, local PDF outline/raw bytes, bridge-backed embedded text, optional bridge OCR, then provider metadata. Bare `Contents` headings are used only to find TOC regions and are not stored as chapters.

`npm run toc:audit` runs synthetic TOC fixtures and any local files under `output/data/documents`. It fails on fixture recall below the target or known garbage chapters, and it labels local misses as needing embedded text/OCR instead of silently accepting noisy PDF bytes.

## qBittorrent sourcing

qBittorrent searches use staged recall queries rather than one exact title string: ISBN, cleaned core title, core title plus author surnames, author/topic tokens, hyphenated title, and broad title. Enabled plugins are searched as grouped jobs with bounded concurrency, and the Library download box keeps the best candidate queue plus a search trace.

Automatic downloads remain strict: unknown-license hits, weak matches, wrong authors, zero-seed rows, solution/manual files, and plugin errors are blocked and shown as diagnostics. An eligible blocked magnet or HTTPS torrent can only be used after an explicit user action.

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
