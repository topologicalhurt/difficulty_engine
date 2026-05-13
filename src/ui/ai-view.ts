import type { AppState, PlannerStore } from '../core/types';
import { el } from './dom';
import { renderAiPromptCard } from './ai-prompt-card';
import { renderAiProposalCard } from './ai-proposal-card';
import { renderAiProviderCard } from './ai-provider-card';
import {
  renderAiRelationshipCard,
  renderAiRelationshipProposalCard,
} from './ai-relationship-card';

export function renderAiView(
  state: AppState,
  store: PlannerStore,
): HTMLElement {
  return el(
    'div',
    { className: 'planner-layout' },
    el(
      'div',
      { className: 'planner-main-grid' },
      el(
        'div',
        { className: 'planner-main-column' },
        renderAiPromptCard(state, store),
        renderAiRelationshipCard(state, store),
      ),
      el(
        'div',
        { className: 'planner-side-column' },
        renderAiProviderCard(state, store),
      ),
    ),
    el(
      'div',
      { className: 'ai-output-section' },
      el('h2', { text: 'AI output' }),
      el(
        'div',
        { className: 'ai-output-grid' },
        renderAiProposalCard(state, store),
        renderAiRelationshipProposalCard(state, store),
      ),
    ),
  );
}
