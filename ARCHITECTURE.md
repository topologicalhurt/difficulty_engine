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
3. Completed PDFs are inspected locally before network metadata: raw outline titles, raw text-like bytes, bridge-backed embedded text extraction, then optional local OCR with sidecar confidence metadata.
4. Online/provider snippets are fallback evidence only and must pass stricter source and chapter gates before they can update project truth.

Every automated TOC attempt must expose strategy, confidence, accepted chapter count, rejected reasons, and evidence anchors when available. Bare TOC headings such as “Contents” are extraction anchors only; they must not be persisted as chapter titles.

Local OCR is bridge-only and opt-in through source settings. Missing Poppler/Tesseract/OCRmyPDF-style local tooling must produce diagnostics rather than app failures. Run `npm run toc:audit` after any matcher, document, qBittorrent, or enrichment change that can affect chapter sourcing. Run `npm run qbit:toc-corpus-audit -- --scan-backups` when validating real qBittorrent/PDF/TOC hit rate; it is dry-run by default and must not start downloads.

## qBittorrent Search Contract

qBittorrent search is recall-first but policy-gated. The app generates staged query intents from ISBN, cleaned/dehyphenated title, subtitle-free title, author/topic surnames, hyphenated titles, distinctive title tokens, and broad title recall. Search jobs are grouped across enabled plugins with a four-job concurrency cap so the app stays under qBittorrent's five-running-search limit, and raw result collection defaults to 150 rows before the persisted best-10 queue is selected.

Automatic acquisition still requires lawful access basis and title/author/ISBN trust. Unknown-license, zero-seed, wrong-author, weak-title, plugin-error, solution/manual, non-PDF qBittorrent file, and unallowed-source rows are persisted as blocked diagnostics under `book.documentAcquisition`, not silently converted into planner truth. qBittorrent file selection is PDF-only and accepts only top-level PDFs or PDFs one folder deep. Users may explicitly retry an eligible blocked magnet or HTTPS torrent source as user-provided/user-owned evidence from the Library download box.

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

1. `classifyReadingSections` and `effectiveReadingPagesForBook`: preserve source TOCs while deriving trusted workload scope from learned section evidence.
2. `buildDifficultyEvidence`: collects seed, effective page burden, topic density, topic rarity, technical density, chapters/TOC quality, exercise signals, local title-cue evidence, and metadata confidence.
3. `estimateLatentWorkload`: turns evidence into `latentWorkload`, `workloadUncertainty`, `evidenceConfidence`, and evidence reasons.
4. `applyGraphWorkloadPropagation`: applies prerequisite depth, parent workload, novelty, breadth, and retention as capped graph evidence.
5. `applyLearnerCalibration`: uses logged actual minutes/pages with shrinkage before changing workload expectations.
6. `deriveScheduleDifficulty`: produces planner truth used by minutes/page, schedule solving, and day allocation.
7. `deriveDisplayDifficulty`: maps planner truth for charts, colors, and explanation only.

The planner contract is strict:

- `scheduleDifficulty` is planner truth.
- `displayDifficulty` is visual truth only. Display compression and mapping controls must not change hours, finish date, day allocation, feasibility, or warnings.
- Source metadata is immutable planner evidence. Reading-scope skips produce derived effective pages and excluded evidence; they must not delete chapters, document refs, enrichment, or reading logs.
- Title-level cues are local only. Intro/expert words become workload evidence only against a high-confidence same-topic comparator; otherwise the evidence reason must say the cue was ignored globally.
- Learner profiles are bounded policy presets from `src/core/profile-policy.ts`. They may change desired challenge, pacing spread, ramp shape, uncertainty tolerance, learner feedback strength, and prerequisite bias, but they must not override manual locks or infeasible hard constraints.
- Nonlinear reading ramp belongs in day allocation. `src/core/reading-ramp.ts` is the single owner for early/building/steady ramp factors, and total remaining work must stay conserved.
- Pacing has three separate stages: `desiredPagesPerDay`, `feasibleMinPagesPerDay`/`feasibleMaxPagesPerDay`, and `finalPagesPerDay`.
- Hard constraints win over desired pacing. When a floor, max page cap, time budget, manual window, or parallel slot binds, the item must expose `pacingBindingReason`.
- Raw difficulty clustering is acceptable when evidence is genuinely similar, but it must be diagnosable through uncertainty or low-variance warnings.

## AI And Autopilot Contract

AI recommendation context must include all planner-relevant non-secret state: books, relations, constraints, reading scope, progress summaries, plan summaries, difficulty evidence, document status labels, warnings, and active profile policy. It must exclude API keys, qBittorrent credentials, bridge settings, local filesystem paths, and full document text.

AI apply paths are intentionally separated:

- Book recommender AI may only add books, remove books, and update `planOrder`.
- Relationship proposals may only update `planOrder`, `manualPrereqs`, and `manualCoStudy` for existing books.
- Project setting suggestions returned by the recommender are advisory until a dedicated planner-settings command applies them.

Autopilot is a proposal system, not a silent mutator. `solveProjectForMe` builds a `PlannerOptimizationInput` from the wizard answers, evaluates a finite policy portfolio, and returns an `AutopilotProposal` with a `PlannerOptimizationResult`, objective breakdown, proof status, binding constraints, Pareto alternatives, patches, reasons, and unchanged reasons. `applyAutopilotProposal` is the only command that mutates project settings from that proposal, and it must preserve progress logs, manual relations, manual overrides, selected books, document metadata, and difficulty locks.

Autopilot apply is constraints-only. Reading-scope patches, book patches, relation patches, and document changes may appear in proposal explanations, but they must not be applied by `applyAutopilotProposal`.

Autopilot proof language is strict: `optimal` means exact only over the declared finite portfolio and deterministic planner model; `window_optimal`, `feasible_with_gap`, and `infeasible` must be used when a broader exact backend cannot prove global optimality. The existing schedule heuristic can warm-start or evaluate candidates, but it must not claim global RCPSP optimality.

## Guardrails

- The product still ships as one HTML artifact.
- The mounted shell is Svelte. Non-Svelte UI helpers are allowed only as focused component/panel helpers invoked by the Svelte shell.
- Core never imports UI.
- UI never computes domain truth directly.
- Repeated primitive operations must use canonical helpers: string compaction/joining/deduplication in `src/core/utils.ts`, number formatting in `src/core/number-format.ts`, display colors in `src/core/display-colors.ts`, stable sorting in `src/core/sort.ts`, external-source matching in `src/core/matchers.ts`, provider metadata cleanup in `src/infra/source-metadata.ts`, display formatting in `src/ui/format.ts`, document content priority in `src/infra/document-content-priority.ts`, document candidate quality in `src/infra/document-candidate-quality.ts`, and document kind/path helpers in `src/infra/qbittorrent-file-kinds.ts`.
- Reading scope, section classification, local title cues, learner profile policy, and reading ramp must use `src/core/reading-scope.ts`, `src/core/section-classifier.ts`, `src/core/effective-pages.ts`, `src/core/local-title-cues.ts`, `src/core/profile-policy.ts`, and `src/core/reading-ramp.ts`. Do not reimplement those policies in selectors, UI, or app commands.
- Static guide copy lives in `src/content/info/readme.ts`; public UI imports must not rely on bundler-specific raw asset query loaders.
- Panels are centralized through `src/ui/dom.ts`; collapse, scroll, and horizontal resize behavior are default panel capabilities with explicit options for exclusions.
- Provider/model autocomplete is centralized through `src/core/ai-provider-registry.ts` plus `src/ui/form-controls.ts`; UI code should not maintain separate model lists or fuzzy matching.
- No inline event handlers, runtime monkey-patching, or retired adapter branches remain in the production path.
- Source audits enforce file-size caps, default-export bans, and stale-runtime removal.
- Before adding a new helper, search the pattern registry in `CHANGE_GUIDE.md`; new helpers are only acceptable when the existing owner cannot express the concept cleanly.
- UI-affecting architecture work should include Browser Use smoke coverage against the standalone artifact for the touched surfaces. Browser smoke does not replace unit, selector, store, architecture, or performance tests.
