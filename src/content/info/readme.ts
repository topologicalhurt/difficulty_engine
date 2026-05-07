export const INFO_README = `# Difficulty Engine Guide

This guide walks through the normal way to use Difficulty Engine. You do not need to understand the solver internals to build a useful plan.

## Jump To

- [Library](#library)
- [Planner Settings](#planner-settings)
- [Plan](#plan)
- [Graphs](#graphs)
- [AI Suggestions](#ai-suggestions)
- [Project](#project)

## Quick Start

- Start in Library. Search for books, add the editions you actually want, and mark which books you already own.
- Open Planner Settings. Set your available hours, study weekdays, page range, and prerequisite behavior.
- Use Plan as the main workspace. The Gantt shows the long-range order; the calendar shows what to read on each study day.
- Use Graphs when you want to understand why books are connected, which topics overlap, and where co-study links came from.
- Use Project to import, export, configure sources, and enable local qBittorrent document acquisition.

## Library

- Library is where the reading list lives.
- Search can add metadata, subjects, descriptions, page counts, and identifiers.
- Enrichment refreshes metadata and can also look for document or table-of-contents evidence when enabled.
- TOC sourcing prefers trusted local evidence first: manual chapters, completed text/EPUB/OCR text, local PDF outline or embedded text, optional local OCR, then online provider snippets.
- Manual prerequisites and co-study links are useful when you know something the metadata does not.
- Document badges tell you whether metadata, a sourced file, or a usable table of contents has been found.

## Planner Settings

- Hours per day and study weekdays are hard planning inputs.
- Strict page floor means the minimum pages per day must fit, or the planner reports a conflict.
- Relaxed page recommendation lets the planner lower the page floor when the strict floor cannot fit.
- Learner profile sets the planner's default attitude: balanced, confidence-building, fast, deep mastery, or manual.
- Relative pacing changes the desired spread of page targets across the current reading list before hard limits are applied.
- Display difficulty mapping changes charts and colors only. It does not change hours, finish date, or calendar allocation.
- Scheduler mode changes how the planner chooses between balance, critical paths, and fastest completion.
- Advanced settings are for changing model behavior. If a setting affects scheduling, the context panel should say so.

## Plan

- The Gantt is the long-range timeline.
- The calendar is the day-by-day reading surface.
- Clicking a book or calendar chip selects it and opens logging details.
- Actual minutes and actual pages override the planned estimate for that day.
- Book details show desired pages/day, feasible range, final pages/day, and why a floor, time budget, max page cap, or manual window is binding.
- Warnings explain plan conflicts or non-blocking concerns. Blocking errors cannot be dismissed.

## Graphs

- The relation DAG shows prerequisite direction.
- Co-study links show books the planner thinks should be read together.
- The topic overlap explorer shows which books share topics and how large those overlaps are.
- Matrix overlap view is the default because it scales better than Venn-style drawings for complex libraries.
- Spatial graph views are useful for intuition, but the matrix is the source of truth for overlap membership.

## AI Suggestions

- AI Suggestions can propose books to add, but it does not mutate the library until you review and apply a proposal.
- The request is batched with your current books, relations, and planning context.
- Provider defaults are cost-first. You can still choose higher-quality models when needed.
- API keys are local integration settings and are never exported inside project JSON.

## Project

- Project import/export uses the canonical project format.
- Local qBittorrent credentials are stored locally and are not exported.
- Source toggles control which providers can contribute metadata, documents, and table-of-contents evidence.
- Local OCR fallback is opt-in and only works through the local bridge when Poppler/Tesseract are installed.
- Diagnostics are hidden in normal builds. Use the debug build when you need detailed engine evidence.
`;
