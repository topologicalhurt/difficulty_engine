# Architecture

The application now has one canonical runtime path:

`PlannerProjectV1 -> PlannerStore -> PlannerEngine or PlannerComputeAdapter -> EngineSnapshot -> RenderModel -> Svelte standalone app or embedded host`

## Build model

`src/template/index.html`
: Static shell used by the esbuild-based single-file bundler.

`src/styles/app.css`
: Canonical design tokens, layout rules, and component styles.

`src/core/`
: Pure planning logic. This includes corpus extraction, relation inference, difficulty modeling, schedule solving, day allocation, render-model derivation, and diagnostics.

`src/app/`
: Store, mount, selector, command, worker-compute adapter, and lifecycle layer. This is the only place mutable application state lives.

`src/ui/`
: Svelte shell plus focused DOM/SVG panel helpers. UI code consumes selector view models and dispatches store commands; it must not compute planner truth.

`src/infra/`
: External boundaries such as enrichment, persistence, and logging.

## TOC And Document Evidence Contract

Chapter evidence is a staged document-forensics pipeline, not a permissive regex scrape:

1. Manual chapters remain authoritative.
2. Completed text, EPUB text, and trusted OCR-text documents are parsed directly.
3. Completed PDFs are inspected locally before network metadata: raw outline titles, raw text-like bytes, bridge-backed embedded text extraction, then optional local OCR.
4. Online/provider snippets are fallback evidence only and must pass stricter source and chapter gates before they can update project truth.

Every automated TOC attempt must expose strategy, confidence, accepted chapter count, rejected reasons, and evidence anchors when available. Bare TOC headings such as “Contents” are extraction anchors only; they must not be persisted as chapter titles.

Local OCR is bridge-only and opt-in through source settings. Missing Poppler/Tesseract binaries must produce diagnostics rather than app failures. Run `npm run toc:audit` after any matcher, document, qBittorrent, or enrichment change that can affect chapter sourcing.

`src/index.ts`
: Named public entrypoint for embedders.

`scripts/build.mjs`
: Bundles `src/main.ts` and the planner worker, inlines CSS, and writes `dist/difficulty_engine.html`.

`scripts/audit_source.py`
: Enforces architectural guardrails for the rewritten runtime.

## Public contracts

- `PlannerProjectV1` is the only supported persisted project format.
- `PlannerEngine` is the pure compute boundary.
- `PlannerComputeAdapter` is the optional sync/worker compute boundary for large projects.
- `PlannerStore` is the command/query boundary used by both the standalone UI and embedded hosts.
- `EnrichmentProvider`, `PersistenceAdapter`, `Clock`, and `Logger` are injected interfaces.

## Difficulty And Pacing Contract

Difficulty is modeled as latent workload with uncertainty. The core stages are:

1. `buildDifficultyEvidence`: collects seed, page burden, topic density, topic rarity, technical density, chapters/TOC quality, exercise signals, and metadata confidence.
2. `estimateLatentWorkload`: turns evidence into `latentWorkload`, `workloadUncertainty`, `evidenceConfidence`, and evidence reasons.
3. `applyGraphWorkloadPropagation`: applies prerequisite depth, parent workload, novelty, breadth, and retention as capped graph evidence.
4. `applyLearnerCalibration`: uses logged actual minutes/pages with shrinkage before changing workload expectations.
5. `deriveScheduleDifficulty`: produces planner truth used by minutes/page, schedule solving, and day allocation.
6. `deriveDisplayDifficulty`: maps planner truth for charts, colors, and explanation only.

The planner contract is strict:

- `scheduleDifficulty` is planner truth.
- `displayDifficulty` is visual truth only. Display compression and mapping controls must not change hours, finish date, day allocation, feasibility, or warnings.
- Pacing has three separate stages: `desiredPagesPerDay`, `feasibleMinPagesPerDay`/`feasibleMaxPagesPerDay`, and `finalPagesPerDay`.
- Hard constraints win over desired pacing. When a floor, max page cap, time budget, manual window, or parallel slot binds, the item must expose `pacingBindingReason`.
- Raw difficulty clustering is acceptable when evidence is genuinely similar, but it must be diagnosable through uncertainty or low-variance warnings.

## Guardrails

- The product still ships as one HTML artifact.
- The mounted shell is Svelte. Non-Svelte UI helpers are allowed only as focused component/panel helpers invoked by the Svelte shell.
- Core never imports UI.
- UI never computes domain truth directly.
- Repeated primitive operations must use canonical helpers: string compaction/joining/deduplication in `src/core/utils.ts`, number formatting in `src/core/number-format.ts`, display colors in `src/core/display-colors.ts`, stable sorting in `src/core/sort.ts`, external-source matching in `src/core/matchers.ts`, provider metadata cleanup in `src/infra/source-metadata.ts`, display formatting in `src/ui/format.ts`, document content priority in `src/infra/document-content-priority.ts`, document candidate quality in `src/infra/document-candidate-quality.ts`, and document kind/path helpers in `src/infra/qbittorrent-file-kinds.ts`.
- Static guide copy lives in `src/content/info/readme.ts`; public UI imports must not rely on bundler-specific raw asset query loaders.
- No inline event handlers, runtime monkey-patching, or retired adapter branches remain in the production path.
- Source audits enforce file-size caps, default-export bans, and stale-runtime removal.
- Before adding a new helper, search the pattern registry in `CHANGE_GUIDE.md`; new helpers are only acceptable when the existing owner cannot express the concept cleanly.
