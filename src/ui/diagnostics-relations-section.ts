import type { RelationEvidence } from '../core/types';
import { card, el } from './dom';
import { formatOneDecimal, formatPercent } from './format';

export function renderRelationsDiagnostics(relations: RelationEvidence[]): HTMLElement {
  return card(
    'Relations',
    el(
      'div',
      { className: 'table-wrap' },
      el(
        'table',
        { className: 'data-table' },
        el(
          'thead',
          {},
          el(
            'tr',
            {},
            el('th', { text: 'From' }),
            el('th', { text: 'To' }),
            el('th', { text: 'Type' }),
            el('th', { text: 'Score' }),
            el('th', { text: 'Confidence' }),
            el('th', { text: 'Reasons' }),
          ),
        ),
        el(
          'tbody',
          {},
          ...relations.slice(0, 80).map((relation) =>
            el(
              'tr',
              {},
              el('td', { text: relation.from }),
              el('td', { text: relation.to }),
              el('td', { text: relation.type }),
              el('td', { text: formatOneDecimal(relation.score) }),
              el('td', { text: formatPercent(relation.confidence) }),
              el('td', { text: relation.reasons.join(', ') }),
            ),
          ),
        ),
      ),
    ),
  );
}
