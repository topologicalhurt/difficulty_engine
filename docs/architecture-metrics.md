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

## Tracking Rules

- Update this file after architecture-focused cleanup passes that materially change file counts, near-limit modules, or duplicate-symbol output.
- Treat the line counts as pressure indicators, not the goal. The goal is clearer ownership, fewer duplicate concepts, and stronger contract enforcement.
- Keep raw metrics sourced from `python3 scripts/architecture_report.py`.
