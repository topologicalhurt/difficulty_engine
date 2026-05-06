# Architecture

The application now has one canonical runtime path:

`PlannerProjectV1 -> PlannerStore -> PlannerEngine -> EngineSnapshot -> RenderModel -> Standalone app or embedded host`

## Build model

`src/template/index.html`
: Static shell used by the esbuild-based single-file bundler.

`src/styles/app.css`
: Canonical design tokens, layout rules, and component styles.

`src/core/`
: Pure planning logic. This includes corpus extraction, relation inference, difficulty modeling, schedule solving, day allocation, render-model derivation, and diagnostics.

`src/app/`
: Store and mount layer. This is the only place mutable application state lives.

`src/ui/`
: Typed DOM rendering. Views consume store state and dispatch commands back through the store.

`src/infra/`
: External boundaries such as enrichment, persistence, and logging.

`src/index.ts`
: Named public entrypoint for embedders.

`scripts/build.mjs`
: Bundles `src/main.ts`, inlines CSS, and writes `dist/difficulty_engine.html`.

`scripts/audit_source.py`
: Enforces architectural guardrails for the rewritten runtime.

## Public contracts

- `PlannerProjectV1` is the only supported persisted project format.
- `PlannerEngine` is the pure compute boundary.
- `PlannerStore` is the command/query boundary used by both the standalone UI and embedded hosts.
- `EnrichmentProvider`, `PersistenceAdapter`, `Clock`, and `Logger` are injected interfaces.

## Guardrails

- The product still ships as one HTML artifact.
- The UI is framework-light and DOM-driven.
- Core never imports UI.
- UI never computes domain truth directly.
- Repeated primitive operations should use canonical helpers: string compaction/deduplication in `src/core/utils.ts`, external-source matching in `src/core/matchers.ts`, provider metadata cleanup in `src/infra/source-metadata.ts`, display formatting in `src/ui/format.ts`, and document content ranking in `src/infra/qbittorrent-file-kinds.ts`.
- No inline event handlers, runtime monkey-patching, or retired adapter branches remain in the production path.
- Source audits enforce file-size caps, default-export bans, and stale-runtime removal.
