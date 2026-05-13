import { selectAiRecommendationViewModel } from '../app/selectors/ai-recommendations';
import type {
  AiRelationshipGoal,
  AiRelationshipProgressionStyle,
  AiRelationshipStrictness,
  AppState,
  PlannerStore,
} from '../core/types';
import { badge, button, card, el } from './dom';
import {
  checkboxControl,
  inputField,
  selectInput,
  type SelectOption,
} from './form-controls';
import { formatPercent } from './format';

const GOAL_OPTIONS: SelectOption[] = [
  { value: 'confidence_first', label: 'Confidence-first' },
  { value: 'deadline_first', label: 'Deadline-first' },
  { value: 'deep_mastery', label: 'Deep mastery' },
  { value: 'survey_first', label: 'Fast survey' },
  { value: 'custom', label: 'Custom' },
];

const STYLE_OPTIONS: SelectOption[] = [
  { value: 'layered', label: 'Layered foundations' },
  { value: 'linear', label: 'Linear progression' },
  { value: 'parallel_tracks', label: 'Parallel tracks' },
  { value: 'project_first', label: 'Project-first' },
];

const STRICTNESS_OPTIONS: SelectOption[] = [
  { value: 'preserve_existing', label: 'Preserve existing links' },
  { value: 'rebalance_soft', label: 'Rebalance softly' },
  { value: 'rebuild_from_scratch', label: 'Rebuild from scratch' },
];

function relationshipOptionValue<T extends string>(event: Event): T | null {
  return event.target instanceof HTMLSelectElement
    ? (event.target.value as T)
    : null;
}

export function renderAiRelationshipCard(
  state: AppState,
  store: PlannerStore,
): HTMLElement {
  const viewModel = selectAiRecommendationViewModel(state);
  const wizard = viewModel.relationshipWizard;
  return card(
    'Plan proposal settings',
    el('p', {
      className: 'muted-copy',
      text: `These settings shape the plan proposal when AI work mode includes plan changes. Context: ${viewModel.contextSummary}`,
    }),
    el(
      'div',
      { className: 'two-column-grid' },
      inputField(
        'Goal',
        selectInput(wizard.goal, GOAL_OPTIONS, {
          onChange: (event) => {
            const value = relationshipOptionValue<AiRelationshipGoal>(event);
            if (value) store.commands.updateAiRelationshipWizard({ goal: value });
          },
        }),
      ),
      inputField(
        'Progression style',
        selectInput(wizard.progressionStyle, STYLE_OPTIONS, {
          onChange: (event) => {
            const value =
              relationshipOptionValue<AiRelationshipProgressionStyle>(event);
            if (value) {
              store.commands.updateAiRelationshipWizard({
                progressionStyle: value,
              });
            }
          },
        }),
      ),
      inputField(
        'Rewrite strictness',
        selectInput(wizard.strictness, STRICTNESS_OPTIONS, {
          onChange: (event) => {
            const value =
              relationshipOptionValue<AiRelationshipStrictness>(event);
            if (value) {
              store.commands.updateAiRelationshipWizard({ strictness: value });
            }
          },
        }),
      ),
      inputField(
        'Manual relation policy',
        el(
          'label',
          { className: 'checkbox-row' },
          checkboxControl({
            checked: wizard.preserveManualRelations,
            onChange: (checked) =>
              store.commands.updateAiRelationshipWizard({
                preserveManualRelations: checked,
              }),
          }),
          el('span', { text: 'Preserve and merge existing manual links' }),
        ),
      ),
    ),
  );
}

export function renderAiRelationshipProposalCard(
  state: AppState,
  store: PlannerStore,
): HTMLElement {
  const viewModel = selectAiRecommendationViewModel(state);
  if (!viewModel.relationshipProposal) {
    return card(
      'Plan proposal',
      el('div', {
        className: 'empty-state',
        text: 'No plan progression proposal yet. Generate rapid-fire question cards if needed, then request a plan proposal.',
      }),
    );
  }
  return card(
    'Plan proposal',
    renderRelationshipProposal(viewModel.relationshipProposal, store),
  );
}

function renderRelationshipProposal(
  proposal: NonNullable<AppState['ui']['aiRelationshipProposal']>,
  store: PlannerStore,
): HTMLElement {
  return el(
    'div',
    { className: 'stack-layout compact-stack' },
    el('p', { className: 'muted-copy', text: proposal.summary }),
    proposal.warnings.length
      ? el(
          'div',
          { className: 'warning-list' },
          ...proposal.warnings.map((warning) =>
            el('div', { className: 'warning-item warning-warn' }, warning),
          ),
        )
      : null,
    el(
      'div',
      { className: 'search-results' },
      ...proposal.stages.map((stage, index) =>
        el(
          'article',
          { className: 'search-result-card ai-proposal-card' },
          badge(`Stage ${index + 1}`),
          el('strong', { text: stage.label }),
          el('div', { className: 'muted-copy', text: stage.bookIds.join(', ') }),
          el('p', { className: 'muted-copy', text: stage.rationale }),
        ),
      ),
    ),
    el(
      'div',
      { className: 'ai-diff-view' },
      el('div', { className: 'diff-pane-label', text: 'Relationship diff' }),
      ...proposal.relations.map((edge) =>
        el(
          'div',
          { className: 'ai-diff-line ai-diff-meta' },
          el('span', { className: 'ai-diff-prefix', text: '~' }),
          el('span', {
            text: `${edge.type}: ${edge.from} -> ${edge.to} (${formatPercent(edge.confidence)})`,
          }),
        ),
      ),
    ),
    el(
      'div',
      { className: 'toolbar-row' },
      button('Apply relationship proposal', {
        className: 'primary-button',
        onClick: () => store.commands.applyAiRelationshipProposal(),
      }),
      button('Discard', {
        className: 'ghost-button',
        onClick: () => store.commands.clearAiRelationshipProposal(),
      }),
    ),
  );
}
