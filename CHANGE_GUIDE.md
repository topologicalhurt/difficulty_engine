# Change Guide

This project should be edited as a set of small, reviewable changes. Before changing code, identify the single concern being changed and use the matching edit path below. If a change does not fit one path, split it.

## Default Change Loop

1. Name the concern: constraint, command, selector, UI component, scheduler rule, graph view, enrichment provider, document handling, or formatting/control primitive.
2. Edit the owner layer first. Do not start from the UI unless the change is display-only.
3. Add or update the closest unit/integration test for that owner.
4. Run the narrow test first, then run `npm run stabilize`.
5. If the change creates a new helper, document why the existing canonical helper could not be reused.

For tests, use shared builders before writing another local fixture: `tests/app/store-test-utils.ts` for store/app tests and `tests/core/engine-test-utils.ts` for core snapshot tests.

## Edit Paths

### Add Or Change A Constraint

- Owner: `src/core/constraint-fields.ts`, `src/core/constraints.ts`, and constraint normalization.
- Wiring: the constraint must be covered by the wiring registry derived from `CONSTRAINT_FIELDS`.
- Projection: use selectors under `src/app/selectors/`; UI components must not compute planner truth.
- Tests: update constraint metadata tests, parameter matrix tests, and any affected core scheduling/difficulty test.
- Avoid: changing UI labels without effect metadata, adding a constraint that does not affect either snapshot state or documented UI-only state.

### Add Or Change A Store Command

- Owner: the focused `src/app/store-*-commands.ts` module for the domain.
- Wiring: add exactly one contract in `src/app/wiring/`.
- Mutation: project mutations go through `commitProject`; UI-only mutations go through `commitUi`.
- Tests: update wiring-contract tests and the smallest store test that exercises the command.
- Avoid: direct state mutation, duplicated command names, or UI code that bypasses store commands.

### Add Or Change UI Display

- Owner: selectors first, then Svelte shell/components under `src/ui/svelte/` or focused tab/panel helpers under `src/ui/`.
- Data flow: UI receives view models and callbacks; UI must not read raw project/snapshot state.
- Shared primitives: use `button`, `selectInput`, `inputField`, `badge`, `renderProgressBar`, and formatter helpers from `src/ui/format.ts`, including `formatCssPercent` for style percentages.
- Tests: update selector tests for data shape and browser smoke only when interaction or mount behavior changes.
- Avoid: local formatting, local control factories, hidden full-tab rerenders, or domain calculations in render functions.

### Add Or Change Scheduler Or DAG Logic

- Owner: focused modules in `src/core/` for relation inference, schedule solving, day allocation, and diagnostics.
- Data flow: solver inputs are plain project/snapshot objects; outputs are immutable snapshot structures.
- Explanation: every non-obvious behavior needs a warning, diagnostic, or relation/difficulty reason.
- Tests: add a core fixture or invariant test before changing UI.
- Avoid: changing render models to hide a solver issue, or adding scheduling logic in selectors/UI.

### Add Or Change Difficulty Or Pacing Logic

- Owner: `src/core/difficulty-evidence.ts`, `src/core/difficulty-latent.ts`, `src/core/difficulty-graph.ts`, `src/core/difficulty-learner.ts`, `src/core/difficulty.ts`, and `src/core/relative-pacing.ts`.
- Contract: `scheduleDifficulty` is planner truth; `displayDifficulty` is visual-only.
- Evidence: new signals must include confidence, a reason, deterministic ordering, and tests for sparse and well-evidenced books.
- Adaptivity: logged actuals may recalibrate only through shrinkage and only after enough pages exist.
- Pacing: compute desired pages/day first, then feasible bounds, then final allocation with `pacingBindingReason`.
- Tests: update `tests/core/difficulty-pipeline.test.ts`, relevant page-floor/pacing tests, and display-mapping tests.
- Avoid: making display compression affect hours, recomputing schedule from UI selectors, rounding early, or silently clipping away desired pacing variation.

### Add Or Change Worker Compute Or Persistence

- Owner: `src/app/store-runtime.ts`, `src/app/compute-adapter.ts`, and `src/app/mount.ts`.
- Contract: project mutations are committed and emitted synchronously; worker results may only replace snapshots.
- Persistence: `project-changed` events are the save trigger, so do not delay them behind async compute.
- Tests: update worker-compute and persistence-save-queue tests.
- Avoid: capturing stale UI state for async snapshot application or letting worker code import DOM, storage, network, or infra providers.

### Add Or Change Enrichment Or Document Acquisition

- Owner: `src/infra/` provider modules and source/document helpers.
- Source masks: source settings decide whether a provider is called.
- Document priority: content-kind ranking must come from the shared document content-priority helpers.
- Matching: title/author/ISBN relevance and source queries must reuse `src/core/matchers.ts`; do not add provider-local fuzzy scoring.
- Provenance: every enrichment/document result must include provider, strategy, confidence, and source details when available.
- TOC order: manual chapters, completed text/EPUB/OCR text, local PDF raw/embedded extraction, optional local OCR, then online/provider fallback.
- TOC quality: “Contents” / “Table of Contents” rows are anchors only and must not be persisted as chapters; weak OCR/provider chapters must stay quarantined unless confidence and source priority justify promotion.
- Tests: provider unit tests plus an enrichment integration test for fallback/failure behavior. Run `npm run toc:audit` whenever chapter sourcing, PDF extraction, OCR, or provider snippet logic changes.
- Avoid: provider-specific logic in core, implicit downloads, or storing local credentials in project JSON.

### Add Or Change Graphs

- Owner: graph selectors and graph-specific UI panels.
- Data flow: graph renderers consume graph view models only.
- Settings: graph behavior controls belong in graph selectors/settings, not scheduler logic unless they truly alter solver state.
- Tests: graph selector tests plus browser smoke for visible setting changes.
- Avoid: duplicating relation shaping in UI panels.

## Canonical Patterns

- UI shell: `src/ui/svelte/AppShell.svelte`
- UI controls: `src/ui/dom.ts`
- UI formatting: `src/ui/format.ts`
- Guide content: `src/content/info/readme.ts`
- Number formatting: `src/core/number-format.ts`
- Display colors: `src/core/display-colors.ts`
- Stable sorting: `src/core/sort.ts`
- String compaction/joining/deduplication: `src/core/utils.ts`
- External-source matching: `src/core/matchers.ts`
- Provider metadata cleanup: `src/infra/source-metadata.ts`
- Progress display/math: `src/app/selectors/progress.ts` and `src/ui/progress.ts`
- Date constants and weekday math: `src/core/date-constants.ts`, `src/core/time.ts`, `src/core/weekdays.ts`
- Planner constraints and pacing math: `src/core/constraints.ts`
- Difficulty evidence/model stages: `src/core/difficulty-evidence.ts`, `src/core/difficulty-latent.ts`, `src/core/difficulty-graph.ts`, `src/core/difficulty-learner.ts`, `src/core/difficulty.ts`
- Desired/feasible/final pacing projection: `src/core/relative-pacing.ts`
- Infra cache time: `src/infra/cache-time.ts`
- Document content priority: `src/infra/document-content-priority.ts`
- Document candidate quality: `src/infra/document-candidate-quality.ts`
- Document content kind and path helpers: `src/infra/qbittorrent-file-kinds.ts`
- Document text/TOC extraction: `src/infra/document-text-extractor.ts`
- PDF outline/raw-byte extraction: `src/infra/pdf-outline-titles.ts`
- TOC line normalization and registered patterns: `src/infra/toc-line-normalization.ts`, `src/infra/toc-extraction-patterns.ts`
- Source/provider enablement policy: `src/core/source-settings-policy.ts`
- Source settings patching: `src/app/store-source-settings-helpers.ts`
- Wiring contracts: `src/app/wiring/`
- App test builders: `tests/app/store-test-utils.ts`
- Core test engine helpers: `tests/core/engine-test-utils.ts`

## Stabilization Command

Run this before considering a manual change safe:

```bash
npm run stabilize
```
