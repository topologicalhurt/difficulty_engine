# Difficulty Engine

Difficulty Engine now ships as a typed, embeddable planner subsystem with one canonical project format, one canonical solver pipeline, and one canonical standalone build artifact.

## Tooling

- TypeScript with strict type-checking
- esbuild for single-file bundling
- ESLint + Prettier for guardrails
- Vitest for unit/integration tests
- Playwright for browser smoke coverage

## Source layout

- `src/core/`: pure planner engine, typed models, diagnostics, and render-model derivation
- `src/app/`: store, mount lifecycle, and command-style mutations
- `src/ui/`: typed DOM views and rendering helpers
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

## Commands

```bash
npm install
npm run build
npm run dev
npm run check
npm run test:e2e
python3 scripts/audit_source.py
```

The production artifact is written to `dist/difficulty_engine.html`.
