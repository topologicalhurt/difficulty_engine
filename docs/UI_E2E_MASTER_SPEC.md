# UI E2E Master Spec

Branch: `codex/ui-e2e-hardening`

## Goal

Ship a UI hardening pass that fixes every observed E2E regression without weakening the current architecture:

- Core remains pure planner truth.
- Store commands remain the only mutation path.
- Selectors remain the UI data contract.
- Svelte shell remains the mounted app shell.
- Focused DOM/SVG helpers are allowed only behind selector view models.
- No browser prompts, inline handlers, raw `innerHTML`, hidden alternate branches, or hidden data loss.

This spec is the implementation contract for the UI branch. Every item below needs an owner, a test, and an acceptance check before the branch is PR-ready.

## Repo Guidance Re-Read

The current root guidance says:

- `ARCHITECTURE.md`: canonical path is `PlannerProjectV1 -> PlannerStore -> PlannerEngine or PlannerComputeAdapter -> EngineSnapshot -> RenderModel -> Svelte standalone app or embedded host`.
- `CHANGE_GUIDE.md`: selectors first for UI, commands for mutation, graph changes through graph selectors/settings, worker/persistence changes must commit project changes synchronously, and canonical helpers must be reused.
- `README.md`: Svelte shell, worker-backed compute for large projects, single-file artifact, local AI keys via `.env`, and no API keys in the static build.

Those rules are non-negotiable for this pass.

## External Research Notes

Set-overlap visualization is the major design risk in this pass.

- UpSet plots were designed because Venn/Euler diagrams do not scale well beyond small set counts; they use an intersection matrix plus bars and rely on sorting/filtering for readability.
- UpSet documentation also recommends Euler diagrams for seeing individual items in very small sets, but not for larger intersection analysis.
- Recent hypergraph visualization summaries describe three practical families: bipartite incidence views, matrix/incidence views, and spatial/polygon views with simplification. The current `O1/O2` hub drawing is a simplified bipartite incidence view, but it does not explain overlap cardinality or topic membership.
- Practical decision: replace the current hypergraph panel with an `Overlap Explorer` that defaults to an UpSet-style intersection matrix for scale, with optional compact incidence/network view for spatial intuition.

References:

- https://pmc.ncbi.nlm.nih.gov/articles/PMC4720993/
- https://upset.app/
- https://pmc.ncbi.nlm.nih.gov/articles/PMC11183158/
- https://www.emergentmind.com/topics/hypergraph-visualization
- https://arxiv.org/abs/2407.19621

AI provider defaults also need a maintained registry. Current public docs indicate:

- OpenAI exposes current model lists through the Models docs and `/v1/models`.
- Anthropic docs list current Claude models and aliases, including provider-level aliases.
- Practical decision: create a local provider-model registry with updateable defaults and aliases, not scattered hardcoded strings in UI fields.

References:

- https://platform.openai.com/docs/models
- https://platform.openai.com/docs/api-reference/models/list
- https://platform.claude.com/docs/en/about-claude/models/overview

## Product-Wide UX Principles

- A naive user should understand each tab from the tab label and one-sentence header.
- Technical diagnostics exist, but should not dominate the normal app.
- Details should appear where the user is working, not force scrolling to the top.
- Inputs should never reject normal typing mid-edit; normalize/clamp on blur, Enter, or explicit commit.
- UI-only controls must not recompute planner truth.
- Planner truth changes should recompute once, then update all dependent views from the same snapshot.
- Every hidden/collapsible state must be represented in UI state or Svelte local state so it does not collapse on every rerender.

## Naming And Tab Contract

Current tabs:

- `Plan`
- `Library`
- `Constraints`
- `AI`
- `Graphs`
- `Diagnostics`
- `Info`
- `Project`

Target normal tabs:

- `Plan`
- `Library`
- `Planner Settings`
- `AI Suggestions`
- `Graphs`
- `Guide`
- `Project`

Debug-only tab:

- `Diagnostics`

Implementation notes:

- Keep internal `AppView` ids stable unless tests prove a rename is worth the churn.
- User-facing labels can change via `APP_VIEW_DEFINITIONS`.
- Diagnostics tab visibility is controlled by a new app capability flag, not by deleting diagnostics functionality.
- The shell must redirect to `Plan` or `Guide` if the active view is `diagnostics` and debug mode becomes false.

## Debug Mode Contract

Requirement: Diagnostics should only appear when the app is built/launched in debug mode.

Implementation target:

- Add `debugUi: boolean` to runtime/mount options, probably under a small `AppCapabilities` or `RuntimeFlags` type.
- Add `DIFFICULTY_ENGINE_DEBUG_UI=1` support in `scripts/runtime-env.mjs`.
- Add `npm run build:debug`; it must call the same env flag and produce the same artifact shape with Diagnostics visible.
- `selectShellViewModel` filters tab definitions by `debugUi`.
- `renderActiveTabBody` handles hidden debug route defensively.
- Warning center stays in Plan for normal users; only deep technical diagnostics are hidden.

Tests:

- Shell selector hides Diagnostics by default.
- Shell selector shows Diagnostics when `debugUi` is true.
- Active diagnostics route falls back to a visible tab when debug is false.
- Static build does not expose debug UI unless the flag is explicitly set.

## Guide / Info README Contract

Requirement: Info should become a friendly, current custom README.

Implementation target:

- Replace hardcoded `src/ui/info-view.ts` copy with a custom source document.
- Preferred source: `src/content/info/readme.ts` so public consumers do not need a Markdown raw-loader plugin.
- Render only a safe Markdown subset: headings, paragraphs, bullets, inline code, and internal app links.
- Do not use `innerHTML`; render parsed blocks as DOM nodes.
- Add internal jump anchors for every major tab/section.
- Graph tab label/header should link to the Graphs guide section.
- If tab labels change, the guide content must be updated in the same commit.

Content must explain:

- What the app is for.
- The normal workflow as a guided tutorial: Library -> Planner Settings -> Plan -> Graphs -> Project.
- What enrichment does.
- What qBittorrent document sourcing means and what the badges mean.
- How to read Gantt, calendar, warnings, and progress.
- What AI Suggestions does and what it will not do automatically.
- What Graphs show, with plain-language differences between DAG, network, and overlap explorer.
- Where technical diagnostics went and how to enable them.

Tests:

- Guide renders from the source document.
- Internal guide anchors exist for every visible tab.
- Audit rejects user-facing tab descriptions containing implementation-only phrasing.

## Graphs And Overlap Explorer

### Current Problems

- Hypergraph view shows opaque labels like `O1`/`O2`.
- It does not visually communicate overlap strength, topic membership, or which books share which topics.
- Existing graph behavior dropdown can rebuild/close or fail to commit changes cleanly.

### Target Graph UX

Graph tab sections:

- `Relation DAG`: prerequisites and required-by edges with arrowheads.
- `Co-study network`: bidirectional co-study links.
- `Topic overlap explorer`: scalable set-overlap view.
- `Load charts`: weekly load, occupancy, difficulty ladder.
- `Graph settings`: dropdown/panel for graph display controls only.

### Topic Overlap Explorer Design

Default view: UpSet-style matrix.

- Rows or columns are books.
- Intersections are topic clusters.
- Bars show overlap size and number of books.
- Matrix dots show which books participate in each overlap.
- Hover/focus shows topic names, book names, overlap score, skim implications, and provenance/confidence.
- Search/filter by book, topic phrase, and minimum overlap count.
- Sort by overlap size, difficulty impact, book count, or title.
- Rationale: the matrix-first view is less visually flashy than a spatial hypergraph, but it is harder to misread, scales beyond small Venn-style diagrams, and makes overlap cardinality explicit.

Optional view: incidence network.

- Topic cluster nodes connect to book nodes.
- Cluster nodes are labeled with actual topic phrases, not `O1`.
- Node size reflects overlap size.
- Edge width reflects overlap score.
- Use semantic zoom and cap visible clusters with clear “show more” control.
- Rationale: the incidence view is useful for intuition and screenshots, but should not be the default because force/spatial layouts can imply relationships from position that are not actually present.

Small-library fallback:

- For 2-4 books, a simplified Euler/Venn-like card can be shown if it is clearer than a matrix.
- This is a fallback, not the scalable default.

Selector requirements:

- Extend `GraphRenderModel` with `overlapExplorer` data:
- `clusters`: id, label, topicIds, topicLabels, bookIds, overlapScore, skimPages, confidence.
- `matrixRows` / `matrixColumns`.
- `sortMode`, `filterText`, `minClusterSize`, `visibleLimit`.
- `emptyStateReason`.

Commands/wiring:

- Add UI-only graph setting commands for expanded settings, overlap view mode, overlap sort, overlap filter, visible limit.
- Graph behavior constraints that change solver behavior remain constraints; purely display behavior becomes UI preferences.

Tests:

- Graph settings dropdown remains open and selectable across updates.
- Changing graph settings updates the visible graph selector output.
- Hypergraph/overlap view no longer emits opaque-only labels.
- Fixture with many topic overlaps shows more than two overlap clusters when data supports it.
- Empty/low-overlap libraries show an intentional explanation rather than a misleading straight line or `O1/O2` hubs.

## AI Suggestions UX

### Provider Defaults

Requirement: Changing provider should show that provider’s default model.

Implementation target:

- Add `src/core/ai-provider-registry.ts`.
- Registry owns:
- provider label.
- default model.
- known model ids.
- aliases and fuzzy match tokens.
- endpoint family.
- max token defaults.
- model freshness notes.

Cost-first defaults:

- OpenAI default: `gpt-5-mini`.
- OpenAI quality option: `gpt-5.2`.
- Anthropic default: `claude-sonnet-4-6`.
- Anthropic quality option: `claude-opus-4-7`.

Provider defaults optimize for cost/speed first; quality models remain visible options.

Behavior:

- Changing provider with an untouched/current provider default model switches to the new provider default.
- Changing provider with a custom model preserves the custom model only if it belongs to that provider or user explicitly keeps it.
- Typing a model matching another provider automatically switches provider, but only after a high-confidence registry match.
- Typing `Claude-sonnet` should suggest/autocomplete the latest known Sonnet alias.
- UI must show the suggested normalized model before committing a replacement.

### API Key Indicator

Requirement: show if an API key was previously loaded.

Implementation target:

- Extend local settings load result or UI state with `apiKeyKnown: boolean`, without exposing the key.
- Indicator states:
- `No key loaded`.
- `Key loaded for this session`.
- `Key configured locally, value hidden`.
- `Runtime/env key loaded`.
- `Key missing after provider enabled`.

Tests:

- Provider change updates default model.
- Model typing suggests closest registry match.
- Model typing switches provider on high-confidence cross-provider match.
- API key indicator is true when local/runtime key exists and never serializes the key.
- Empty response and invalid JSON remain user-friendly.

### Output Token Cap Editing

Requirement: user can delete the entire value while editing; clamp after blur or Enter.

Implementation target:

- Introduce a shared `draftNumberInputControl` or Svelte component for numeric drafts.
- It keeps local string state while focused.
- It commits normalized numeric value on blur, Enter, or spinner change.
- It permits `''`, `'-'`, and partial decimals during edit.
- Use it for AI output token cap first, then migrate constraints where lag/typing issues occur.

Tests:

- Clearing the output token cap field does not immediately write `0`/`NaN`.
- Blur clamps to the configured min/max.
- Enter commits and clamps.

## Constraint Interaction Performance

### Current Risk

Constraints currently call deferred store updates that still recompute the planner snapshot on many checkbox/select changes. This can stutter for large libraries and can also rebuild dropdowns/details.

### Target Behavior

- Checkbox/select clicks should visually toggle immediately.
- Expensive recompute should be scheduled once per interaction frame and should not block the click acknowledgement.
- For heavy projects, recompute should use worker mode when threshold is reached.
- Pure UI state such as focused field or advanced group toggles must not recompute snapshots.

Implementation target:

- Add interaction instrumentation around constraint updates:
- event-to-visual-update latency.
- snapshot compute duration.
- tab render duration.
- selector hit/miss count.
- For constraint fields, split immediate local control state from semantic commit where appropriate.
- For low-cost controls, commit immediately if no stutter is observed.
- For high-cost controls, show a `Recomputing plan...` non-blocking indicator.
- Graph settings dropdown open state must be stable in UI/Svelte state.

High-risk controls:

- Study weekdays.
- Days per week.
- Graph behavior settings.
- Difficulty mapping chart controls.
- Scheduler/feasibility controls.

Tests:

- UI-only constraint focus/open changes do not recompute.
- Weekday click emits one project-changed and one snapshot-updated event.
- Graph dropdown remains open after a graph setting changes.
- Browser smoke measures no visible white-frame/full-panel replacement during common controls.
- Perf CI has a focused interaction budget for 200-book and 500-book fixtures.

## Plan View Ergonomics

### Resizable Panels

Requirement: reading list panel should be horizontally resizable.

Implementation target:

- Add a shared split-pane primitive.
- Persist width in `uiPreferences`, not project truth, if it should survive reload.
- Enforce min/max widths and keyboard accessible resize handles.
- Use CSS grid variables, not inline one-off layout logic.

Tests:

- Resizing updates UI preference.
- Width survives reload/import only if preference says so.
- Keyboard resize works.

### Close Book Details Panel

Requirement: close details once open.

Implementation target:

- Add `Clear selection` command or reuse `selectBook(null)` / clear selected calendar entry.
- Add visible close button in Library and Plan inspectors.
- Calendar selection close should clear `selectedCalendarEntry`.

Tests:

- Close button hides detail panel.
- Close does not mutate project or schedule.

### Calendar Selected Book Context

Requirement: selecting a calendar item should show logging/details nearby without scrolling to top.

Implementation target:

- Make calendar logging context sticky within the Plan side column.
- For small screens, use a bottom sheet or anchored popover.
- Clicking a calendar chip selects the entry and scrolls/focuses the side panel into view only if it is offscreen.
- Avoid clipping through panels; use a normal document-flow side panel first, popover only when necessary.

Tests:

- Calendar chip selection focuses or reveals the logging context.
- Logging panel stays visible while scrolling calendar.
- Panel does not overlap or clip through the Gantt/calendar under normal widths.

### Collapse Gantt And Calendar

Requirement: Gantt and calendar should be independently collapsible.

Implementation target:

- Add `uiPreferences.planSections`: `{ ganttOpen, calendarOpen }` or equivalent.
- Collapse state is display-only.
- Collapsed section header still shows key stats and search/jump controls.

Tests:

- Collapse toggles do not recompute snapshot.
- State persists in UI preferences.

### Search / Jump In Gantt And Calendar

Requirement: Gantt and calendar each get a book search that jumps to first occurrence.

Implementation target:

- Add `PlanSearchViewModel`.
- Search options come from scheduled books only.
- Gantt jump scrolls to first matching row.
- Calendar jump scrolls to first date containing the book and selects that chip.
- Search should reuse the shared text input behavior; no one-character or no-space typing regression.

Tests:

- Gantt search jumps to row.
- Calendar search jumps to first occurrence and opens logging context.
- Search typing preserves spaces and does not stutter.

### Gantt Zoom Range

Requirement: zoom out further for multiyear plans.

Implementation target:

- Lower `PLAN_ZOOM_MIN` and add semantic zoom presets:
- `Overview`.
- `Month`.
- `Quarter`.
- `Detailed`.
- At extreme zoom-out, bars stay visible and labels move to hover/title or side list.

Tests:

- Gantt accepts lower zoom than current min.
- Multiyear fixture keeps bars visible and timeline label useful.

## Warnings

Requirement: dismiss warnings, not errors.

Implementation target:

- Add dismissed warning types to `PlannerProjectV1` so dismissal persists through export/import.
- Dismiss only warnings with severity `warn` or `info`; never hide `fail`.
- Dismissed warnings should be recoverable from a `Show dismissed` control.
- Warning dismissal is by warning `code`/type, not by per-instance hash. The user is intentionally saying “ignore this kind of non-blocking warning.”
- If a dismissed warning type later appears as severity `fail`, it must still be shown.

Tests:

- Dismissing a warning hides it from warning center.
- Blocking failures cannot be dismissed.
- Dismissed warning types survive recompute and project export/import.
- New warnings with the same non-blocking warning type are hidden by design; warnings with a different type still show.

## Library And Document Status

### Document Badges

Requirement: separate tags for qBittorrent document sourced and OCR/TOC success.

Target badges:

- `Enriched`: metadata/enrichment fields updated.
- `PDF sourced`: completed qBittorrent/local document ref exists and selected/trusted.
- `Text sourced`: completed text/EPUB/OCR text source exists.
- `TOC ready`: chapters accepted with confidence above threshold.
- `Weak TOC`: chapters exist but low confidence.
- `No TOC`: no accepted chapters.

Implementation target:

- Add selector-level document badge projection in `src/app/selectors/library.ts` or a focused document selector.
- Do not inspect raw docs in UI components.
- Badge truth derives from `BookDocumentRef`, enrichment provenance, and TOC confidence.

Tests:

- qBittorrent completed PDF shows `PDF sourced`.
- Accepted TOC from completed document shows `TOC ready`.
- Weak inferred TOC shows `Weak TOC`.
- Badges are independent; `Enriched` and `PDF sourced` can both show.

## Graph Behavior Dropdown Bug

Requirement: graph behavior settings must be selectable.

Likely causes:

- `<details>` open state is not stored, so graph view rebuilds can close the dropdown.
- Constraint updates trigger full active tab replacement.
- Some controls defer recompute and rerender while the user is interacting.

Implementation target:

- Store graph options dropdown open state in UI state or Svelte component state.
- Move graph display-only settings out of solver constraints if they are not solver truth.
- Ensure select controls retain focus/value through rerender using stable focus keys.

Tests:

- Open graph settings, change each select/checkbox, dropdown remains usable.
- The visible graph changes when the setting is supposed to affect display.
- Display-only graph settings do not recompute planner snapshot.

## Calendar / Gantt Clipping And Layout

Requirements:

- Book selection panel must not be fixed/clipping incorrectly.
- Calendar chip detail/logging must be contained.
- Calendar and Gantt should tolerate long titles and multiyear spans.

Implementation target:

- Audit CSS containment around `.planner-main-grid`, `.planner-side-column`, `.calendar-log-panel`, `.calendar-chip`, `.gantt-*`.
- Prefer sticky side panel over absolute/fixed overlays.
- Add `min-width: 0`, overflow containment, and safe text truncation where needed.
- Keep hover titles for full text.

Tests:

- Browser smoke with long book titles.
- Calendar click opens log panel without clipping.
- Scrolling Plan does not create white gaps or clipped side panel.

## Performance And Rendering

Requirement: option clicks and typing must not stutter or fail to register.

Implementation target:

- Add Browser Use or Playwright scenario for interactive latency:
- click weekdays.
- change scheduler select.
- open graph settings and select option.
- type in AI prompt/model/search.
- scroll Plan with multiyear project.
- Instrument active tab render key changes and avoid full tab replacement when only local control state changes.
- Consider moving the most interactive Plan/Constraints/AI controls fully into Svelte components rather than DOM helpers if current replacement model remains a bottleneck.
- Ensure worker auto mode is active for large imported projects.

Acceptance:

- Typing spaces works in AI prompt/model/search.
- Checkbox click updates visual state immediately.
- No observed white half-screen frame in browser smoke.
- 500-book fixture remains responsive for common controls.

## Implementation Sequence

### Commit 1: Debug/Guide Foundation

- Add debug UI capability flag.
- Filter Diagnostics tab.
- Add custom Info README source and safe renderer.
- Update tab labels/descriptions.
- Tests: shell selector, info renderer, user-copy audit.

### Commit 2: AI Provider Registry

- Add provider/model registry.
- Provider changes update model defaults.
- Model autocomplete/suggestion and cross-provider switching.
- API key loaded indicator.
- Draft number input for output token cap.
- Tests: AI selector/store/UI input tests.

### Commit 3: Constraint And Graph Controls Reliability

- Stabilize graph dropdown open state.
- Classify graph settings display-only vs solver truth.
- Improve constraint interaction commit path.
- Tests: graph controls, weekday latency/event count, display-only recompute tests.

### Commit 4: Overlap Explorer Rewrite

- Replace current hypergraph hub view with UpSet-style overlap explorer.
- Add incidence view optional fallback.
- Add selector data model and tests.
- Browser smoke for complex overlap fixture.

### Commit 5: Plan Ergonomics

- Resizable reading list/split pane.
- Close detail panels.
- Sticky calendar logging context.
- Collapsible Gantt/calendar.
- Search/jump for Gantt/calendar.
- More zoom-out presets.
- Tests: plan selectors, UI interactions, smoke.

### Commit 6: Document Badges And Warning Dismissal

- Add document/TOC badges.
- Add warning dismissal for non-blocking warnings.
- Tests: badge selector tests, warning dismissal tests.

### Commit 7: Performance Polish And Regression Sweep

- Run interactive browser profiling.
- Fix remaining stutter/white-frame causes.
- Add final smoke/perf cases.
- Run `npm run stabilize`, `npm run perf:ci`, and `npm audit --audit-level=moderate`.

## Acceptance Checklist By E2E Finding

- [ ] Diagnostics tab hidden unless debug UI is enabled.
- [ ] Info becomes friendly current Guide content sourced from an editable README.
- [ ] Hypergraph becomes clear overlap explorer with meaningful labels and scalable overlap representation.
- [ ] Graph behavior dropdown controls are selectable and remain open/usable.
- [ ] Changing AI provider shows provider default model.
- [ ] AI tab shows whether an API key was previously loaded.
- [ ] Output token cap can be empty while editing and clamps on blur/Enter.
- [ ] AI model field autocompletes/suggests closest maintained model.
- [ ] Cross-provider model entry switches provider when confidence is high.
- [ ] Constraint option clicks, especially weekdays, do not visibly stutter.
- [ ] Reading list panel is horizontally resizable.
- [ ] Book details panel can be closed.
- [ ] Separate document badges show PDF sourced and TOC/OCR success.
- [ ] Calendar item selection reveals logging/details without scrolling to top.
- [ ] Calendar selection/logging panel does not clip through other panels.
- [ ] Gantt zooms further out for multiyear plans.
- [ ] Non-blocking warnings can be dismissed and restored.
- [ ] Gantt and calendar can be collapsed independently.
- [ ] Gantt and calendar have book search/jump.
- [ ] Technical tab labels/copy are renamed for naive users and link to Guide sections.
- [ ] Additional UI inconsistencies are captured as follow-up spec items before implementation.

## Open Questions For User

No open product questions remain before implementation. New findings should be appended here only if they affect product behavior or implementation sequencing.
