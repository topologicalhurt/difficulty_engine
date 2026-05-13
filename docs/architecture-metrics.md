# Architecture Metrics

Baseline captured after Pass 0 of the maintainability campaign.

## 2026-05-13 Baseline

- Source files: 341
- Total source lines: 42,872
- Files over 250 lines: 35
- Files over 500 lines: 0
- Duplicate top-level symbols: none detected
- Largest near-limit modules:
  - `src/app/store-ai-recommendations.ts` - 498 lines
  - `src/core/document-acquisition-state.ts` - 493 lines
  - `src/app/store-document-commands.ts` - 490 lines
  - `src/app/store-enrichment.ts` - 485 lines
  - `src/ui/library-documents-panel.ts` - 475 lines
  - `src/infra/ai-recommendation-client.ts` - 459 lines
  - `src/core/project-normalize-documents.ts` - 439 lines
  - `src/infra/qbittorrent-search.ts` - 434 lines
  - `src/app/wiring/ui-contracts.ts` - 426 lines

## 2026-05-13 Pass 2

- Source files: 343
- Total source lines: 42,900
- Files over 250 lines: 34
- Files over 500 lines: 0
- Duplicate top-level symbols: none detected
- Type boundary change: split mixed service/store/mount contracts out of `src/core/types/interfaces.ts` into focused type modules exported by the canonical `src/core/types.ts` barrel.

## 2026-05-13 Pass 3

- Source files: 344
- Total source lines: 42,916
- Files over 250 lines: 34
- Files over 500 lines: 0
- Duplicate top-level symbols: none detected
- Store command change: centralized one-shot async invalidation in `src/app/store-request-sequencer.ts` and tightened wiring tests so each public command has a single wiring owner, with the constraint matrix as the explicit exception.

## 2026-05-13 Pass 4

- Source files: 344
- Total source lines: 42,909
- Files over 250 lines: 34
- Files over 500 lines: 0
- Duplicate top-level symbols: none detected
- Core graph change: moved topological ordering, prerequisite child maps, and weighted critical-path length calculation into `src/core/relation-graph-utils.ts` so schedule ordering and descendant selectors share one DAG traversal implementation.

## 2026-05-13 Pass 5

- Source files: 344
- Total source lines: 42,929
- Files over 250 lines: 34
- Files over 500 lines: 0
- Duplicate top-level symbols: none detected
- Document acquisition change: centralized qBittorrent top-surface PDF selection and trust rejection in `src/infra/qbittorrent-selection.ts`; acquisition now only applies side effects after the pure selector chooses or rejects a trusted PDF.

## 2026-05-13 Pass 6

- Source files: 345
- Total source lines: 42,972
- Files over 250 lines: 34
- Files over 500 lines: 0
- Duplicate top-level symbols: none detected
- AI contract change: centralized AI request context capture/stale checks in `src/app/store-ai-request-context.ts`, covering planner digest, provider/model, settings revision, prompt, and clarification state without serializing local API keys.

## 2026-05-13 Pass 7

- Source files: 345
- Total source lines: 42,974
- Files over 250 lines: 34
- Files over 500 lines: 0
- Duplicate top-level symbols: none detected
- UI system change: routed plan collapsible cards through the canonical `panel()` primitive so controlled collapse state, panel classes, and toggle behavior use one shared implementation instead of a bespoke card shell.

## 2026-05-13 Pass 8

- Source files: 345
- Total source lines: 43,071
- Files over 250 lines: 34
- Files over 500 lines: 0
- Duplicate top-level symbols: none detected
- Selector/performance change: memoized graph and Library view models on their real project/snapshot/UI/enrichment inputs, reused one graph visibility context per render-model build to avoid repeated full-library scans, and added a timer fallback so UI renders cannot get stuck behind a stalled animation frame.

## Tracking Rules

- Update this file after architecture-focused cleanup passes that materially change file counts, near-limit modules, or duplicate-symbol output.
- Treat the line counts as pressure indicators, not the goal. The goal is clearer ownership, fewer duplicate concepts, and stronger contract enforcement.
- Keep raw metrics sourced from `python3 scripts/architecture_report.py`.
