import type { AppState, PlannerStore } from '../core/types';
import { button, card, el } from './dom';

export function renderAutopilotCard(
  state: AppState,
  store: PlannerStore,
): HTMLElement {
  const proposal = state.ui.autopilotProposal;
  return card(
    'Solve everything for me',
    el('p', {
      className: 'muted-copy',
      text: 'Creates a confidence-first proposal that can be reviewed before changing planner settings.',
    }),
    el(
      'div',
      { className: 'toolbar-row' },
      button('Generate proposal', {
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
      ? el(
          'div',
          { className: 'stack-layout compact-stack' },
          el('strong', { text: proposal.summary }),
          el(
            'div',
            { className: 'stack-list compact-stack' },
            ...proposal.reasons.map((reason) =>
              el('div', { className: 'stack-row', text: `+ ${reason}` }),
            ),
            ...proposal.unchangedReasons.map((reason) =>
              el('div', { className: 'stack-row muted-copy', text: `= ${reason}` }),
            ),
          ),
          el('pre', {
            className: 'code-block',
            text: JSON.stringify(
              {
                constraints: proposal.constraintPatch,
                readingScope: proposal.readingScopeSettingsPatch,
              },
              null,
              2,
            ),
          }),
          button('Apply proposal', {
            className: 'primary-button',
            onClick: () => store.commands.applyAutopilotProposal(),
          }),
        )
      : null,
  );
}
