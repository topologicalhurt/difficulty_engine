import type {
  AutopilotConfidencePosture,
  AutopilotDeadlinePolicy,
  AutopilotGoal,
  FeasibilityMode,
  PlannerOptimizationObjectiveBreakdown,
  PlannerOptimizationPlan,
  PlannerStore,
} from '../core/types';
import type { ProjectViewModel } from '../app/selectors/project';
import { badge, button, card, el } from './dom';
import {
  draftNumberInputControl,
  inputField,
  selectInput,
  textInputControl,
  type SelectOption,
} from './form-controls';
import { formatHours, formatWholeNumber } from './format';

const GOAL_OPTIONS: SelectOption[] = [
  { value: 'confidence_first', label: 'Confidence-first' },
  { value: 'deadline_first', label: 'Deadline-first' },
  { value: 'fast_survey', label: 'Fast survey' },
  { value: 'deep_mastery', label: 'Deep mastery' },
  { value: 'custom', label: 'Custom weighting' },
];

const DEADLINE_OPTIONS: SelectOption[] = [
  { value: 'soft', label: 'Soft deadline' },
  { value: 'strict', label: 'Strict deadline' },
  { value: 'none', label: 'No deadline' },
];

const CONFIDENCE_OPTIONS: SelectOption[] = [
  { value: 'conservative', label: 'Conservative' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'aggressive', label: 'Aggressive' },
];

const FLOOR_OPTIONS: SelectOption[] = [
  { value: 'practical', label: 'Practical page floor' },
  { value: 'strict_floor', label: 'Strict page floor' },
];

function optionValue<T extends string>(event: Event): T | null {
  return event.target instanceof HTMLSelectElement
    ? (event.target.value as T)
    : null;
}

function bookReferenceText(viewModel: ProjectViewModel, ids: string[]): string {
  return ids
    .map(
      (id) =>
        viewModel.autopilotBookRefs.find((book) => book.id === id)?.title ?? id,
    )
    .join(', ');
}

function parseBookReferences(
  viewModel: ProjectViewModel,
  value: string,
): string[] {
  const byLookup = new Map<string, string>();
  viewModel.autopilotBookRefs.forEach((book) => {
    byLookup.set(book.id.toLowerCase(), book.id);
    byLookup.set(book.title.toLowerCase(), book.id);
    byLookup.set(book.short.toLowerCase(), book.id);
  });
  return Array.from(
    new Set(
      value
        .split(',')
        .map((part) => part.trim().toLowerCase())
        .map((part) => byLookup.get(part))
        .filter((id): id is string => Boolean(id)),
    ),
  );
}

function wizardCard(
  title: string,
  text: string,
  ...children: Array<HTMLElement | null>
): HTMLElement {
  return el(
    'div',
    { className: 'search-result-card autopilot-wizard-card' },
    el('strong', { text: title }),
    el('p', { className: 'muted-copy', text }),
    ...children,
  );
}

function objectiveRows(
  objective: PlannerOptimizationObjectiveBreakdown,
): HTMLElement {
  const rows = Object.entries(objective).map(([key, value]) =>
    el(
      'tr',
      {},
      el('td', { text: key.replace(/([A-Z])/g, ' $1') }),
      el('td', { text: String(value) }),
    ),
  );
  return el(
    'table',
    { className: 'compact-table' },
    el('tbody', {}, ...rows),
  );
}

function planSummary(plan: PlannerOptimizationPlan): HTMLElement {
  return el(
    'div',
    { className: 'stack-row' },
    el('strong', { text: plan.label }),
    el('span', {
      className: 'muted-copy',
      text: `${plan.finishDate ?? 'unknown finish'} · ${plan.spanWeeks} week(s) · ${formatHours(plan.totalHours)} · peak ${formatWholeNumber(plan.peakBooks)} book(s)`,
    }),
  );
}

export function renderAutopilotCard(
  viewModel: ProjectViewModel,
  store: PlannerStore,
): HTMLElement {
  const draft = viewModel.autopilotDraft;
  const proposal = viewModel.autopilotProposal;
  const updateDraft = store.commands.updateAutopilotDraft;
  return card(
    'Solve everything for me',
    el('p', {
      className: 'muted-copy',
      text:
        'Answer the cards, then generate an optimized preview. The solver scores a finite policy portfolio with hard constraints first, then deadline, prerequisite, overload, uncertainty, switching, and pacing objectives.',
    }),
    el(
      'div',
      { className: 'responsive-grid two-column-grid' },
      wizardCard(
        '1. Goal',
        'Choose the high-level objective. This sets weights; it does not mutate the project until apply.',
        inputField(
          'Optimization goal',
          selectInput(draft.goal, GOAL_OPTIONS, {
            onChange: (event) => {
              const value = optionValue<AutopilotGoal>(event);
              if (value) updateDraft({ goal: value });
            },
          }),
        ),
      ),
      wizardCard(
        '2. Deadline',
        'Soft deadlines minimize lateness without overriding confidence. Strict deadlines become hard feasibility pressure.',
        inputField(
          'Deadline policy',
          selectInput(draft.deadlinePolicy, DEADLINE_OPTIONS, {
            onChange: (event) => {
              const value = optionValue<AutopilotDeadlinePolicy>(event);
              if (value) updateDraft({ deadlinePolicy: value });
            },
          }),
        ),
        inputField(
          'Target end date',
          textInputControl({
            focusKey: 'autopilot-target-end-date',
            type: 'date',
            value: draft.targetEndDate,
            onInput: (targetEndDate) => updateDraft({ targetEndDate }),
          }),
        ),
        inputField(
          'Allowed lateness days',
          draftNumberInputControl({
            focusKey: 'autopilot-lateness-days',
            min: 0,
            step: 1,
            value: draft.latenessToleranceDays,
            onCommit: (value) =>
              updateDraft({
                latenessToleranceDays: Math.max(0, Math.round(value)),
              }),
          }),
        ),
      ),
      wizardCard(
        '3. Confidence',
        'Controls how aggressively the optimizer exposes uncertainty and challenge early in the plan.',
        inputField(
          'Confidence posture',
          selectInput(draft.confidencePosture, CONFIDENCE_OPTIONS, {
            onChange: (event) => {
              const value = optionValue<AutopilotConfidencePosture>(event);
              if (value) updateDraft({ confidencePosture: value });
            },
          }),
        ),
        inputField(
          'Books that feel scary',
          textInputControl({
            focusKey: 'autopilot-scary-books',
            value:
              draft.scaryBookText || bookReferenceText(viewModel, draft.scaryBookIds),
            placeholder: 'Exact book titles or ids, comma separated',
            onInput: (value) =>
              updateDraft({
                scaryBookText: value,
                scaryBookIds: parseBookReferences(viewModel, value),
              }),
          }),
          'Matching books receive a penalty for appearing too early.',
        ),
        inputField(
          'Avoid starting early',
          textInputControl({
            focusKey: 'autopilot-avoid-books',
            value:
              draft.avoidEarlyBookText ||
              bookReferenceText(viewModel, draft.avoidEarlyBookIds),
            placeholder: 'Exact book titles or ids, comma separated',
            onInput: (value) =>
              updateDraft({
                avoidEarlyBookText: value,
                avoidEarlyBookIds: parseBookReferences(viewModel, value),
              }),
          }),
          'Use for books that should wait until foundations are established.',
        ),
      ),
      wizardCard(
        '4. Constraints',
        'These are treated as hard planning inputs before soft objectives are considered.',
        inputField(
          'Hard parallel cap',
          draftNumberInputControl({
            focusKey: 'autopilot-hard-parallel-cap',
            min: 1,
            max: 12,
            step: 1,
            value: draft.hardParallelCap,
            onCommit: (value) =>
              updateDraft({
                hardParallelCap: Math.max(1, Math.round(value)),
              }),
          }),
        ),
        inputField(
          'Daily hours',
          draftNumberInputControl({
            focusKey: 'autopilot-daily-hours',
            min: 0.25,
            max: 16,
            step: 0.25,
            value: draft.dailyHours,
            onCommit: (value) =>
              updateDraft({
                dailyHours: Math.max(0.25, value),
              }),
          }),
        ),
        inputField(
          'Page-floor policy',
          selectInput(draft.floorPolicy, FLOOR_OPTIONS, {
            onChange: (event) => {
              const value = optionValue<FeasibilityMode>(event);
              if (value) updateDraft({ floorPolicy: value });
            },
          }),
        ),
      ),
    ),
    el(
      'div',
      { className: 'toolbar-row' },
      button('Generate optimized preview', {
        className: 'primary-button',
        onClick: () => store.commands.solveProjectForMe(),
      }),
      proposal
        ? button('Dismiss proposal', {
            className: 'ghost-button',
            onClick: () => store.commands.clearAutopilotProposal(),
          })
        : null,
    ),
    proposal
      ? wizardCard(
          '5. Review',
          proposal.summary,
          el(
            'div',
            { className: 'toolbar-row' },
            badge(proposal.optimization.proofStatus, proposal.optimization.status === 'ready' ? 'success' : 'danger'),
            badge(proposal.optimization.backend, 'neutral'),
          ),
          planSummary(proposal.optimization.recommendedPlan),
          el(
            'div',
            { className: 'stack-list compact-stack' },
            ...proposal.optimization.bindingConstraints.map((item) =>
              el('div', { className: 'stack-row', text: `binding: ${item}` }),
            ),
            ...proposal.optimization.relaxationSuggestions.map((item) =>
              el('div', {
                className: 'stack-row muted-copy',
                text: `relaxation: ${item}`,
              }),
            ),
          ),
          objectiveRows(proposal.optimization.objectiveBreakdown),
          proposal.optimization.paretoAlternatives.length
            ? el(
                'div',
                { className: 'stack-layout compact-stack' },
                el('strong', { text: 'Pareto comparison' }),
                ...proposal.optimization.paretoAlternatives.map(planSummary),
              )
            : null,
          el('pre', {
            className: 'code-block',
            text: JSON.stringify(
              {
                constraints: proposal.constraintPatch,
                readingScope: proposal.readingScopeSettingsPatch,
                proofScope: proposal.optimization.proofScope,
              },
              null,
              2,
            ),
          }),
          button('Apply proposal', {
            className: 'primary-button',
            disabled: proposal.optimization.status !== 'ready',
            onClick: () => store.commands.applyAutopilotProposal(),
          }),
        )
      : null,
  );
}
