# Change Guide

This project should be edited as a set of small, reviewable changes. Before changing code, identify the single concern being changed and use the matching edit path below. If a change does not fit one path, split it.

## Default Change Loop

1. Name the concern: constraint, command, selector, UI component, scheduler rule, graph view, enrichment provider, document handling, or formatting/control primitive.
2. Edit the owner layer first. Do not start from the UI unless the change is display-only.
3. Add or update the closest unit/integration test for that owner.
4. Run the narrow test first, then run `npm run stabilize`.

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

- Owner: selectors first, then `src/ui/` renderers.
- Data flow: UI receives view models and callbacks; UI must not read raw project/snapshot state.
- Shared primitives: use `button`, `selectInput`, `inputField`, `badge`, `renderProgressBar`, and formatter helpers from `src/ui/format.ts`, including `formatCssPercent` for style percentages.
- Tests: update selector tests for data shape and browser smoke only when interaction or mount behavior changes.
- Avoid: local formatting, local control factories, or domain calculations in render functions.

### Add Or Change Scheduler Or DAG Logic

- Owner: focused modules in `src/core/` for relation inference, schedule solving, day allocation, and diagnostics.
- Data flow: solver inputs are plain project/snapshot objects; outputs are immutable snapshot structures.
- Explanation: every non-obvious behavior needs a warning, diagnostic, or relation/difficulty reason.
- Tests: add a core fixture or invariant test before changing UI.
- Avoid: changing render models to hide a solver issue, or adding scheduling logic in selectors/UI.

### Add Or Change Enrichment Or Document Acquisition

- Owner: `src/infra/` provider modules and source/document helpers.
- Source masks: source settings decide whether a provider is called.
- Document priority: content-kind ranking must come from the shared document/qBittorrent helpers.
- Matching: title/author/ISBN relevance and source queries must reuse `src/core/matchers.ts`; do not add provider-local fuzzy scoring.
- Provenance: every enrichment/document result must include provider, strategy, confidence, and source details when available.
- Tests: provider unit tests plus an enrichment integration test for fallback/failure behavior.
- Avoid: provider-specific logic in core, implicit downloads, or storing local credentials in project JSON.

### Add Or Change Graphs

- Owner: graph selectors and graph-specific UI panels.
- Data flow: graph renderers consume graph view models only.
- Settings: graph behavior controls belong in graph selectors/settings, not scheduler logic unless they truly alter solver state.
- Tests: graph selector tests plus browser smoke for visible setting changes.
- Avoid: duplicating relation shaping in UI panels.

## Canonical Patterns

- UI controls: `src/ui/dom.ts`
- UI formatting: `src/ui/format.ts`
- String compaction/deduplication: `src/core/utils.ts`
- External-source matching: `src/core/matchers.ts`
- Progress display/math: `src/app/selectors/progress.ts` and `src/ui/progress.ts`
- Date constants and weekday math: `src/core/date-constants.ts`, `src/core/time.ts`, `src/core/weekdays.ts`
- Planner constraints and pacing math: `src/core/constraints.ts`
- Infra cache time: `src/infra/cache-time.ts`
- Document content kind and path helpers: `src/infra/qbittorrent-file-kinds.ts`
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
