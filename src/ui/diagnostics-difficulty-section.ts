import type { DifficultyRowView } from '../app/selectors/diagnostics';
import { card, el } from './dom';
import { formatOneDecimal, formatPercent } from './format';

export function renderDifficultyDiagnostics(
  rows: DifficultyRowView[],
): HTMLElement {
  return card(
    'Difficulty model',
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
            el('th', { text: 'Book' }),
            el('th', { text: 'Seed' }),
            el('th', { text: 'Corpus' }),
            el('th', { text: 'Workload prior' }),
            el('th', { text: 'Workload lift' }),
            el('th', { text: 'Metadata' }),
            el('th', { text: 'Graph' }),
            el('th', { text: 'Novelty' }),
            el('th', { text: 'Breadth' }),
            el('th', { text: 'Retention' }),
            el('th', { text: 'Schedule' }),
          ),
        ),
        el(
          'tbody',
          {},
          ...rows.map(({ bookLabel, difficulty }) =>
            el(
              'tr',
              {},
              el('td', { text: bookLabel }),
              el('td', { text: formatOneDecimal(difficulty.seed) }),
              el('td', { text: formatOneDecimal(difficulty.corpusComplexity) }),
              el('td', {
                text: formatOneDecimal(difficulty.subjectWorkloadPrior),
              }),
              el('td', {
                text: formatOneDecimal(difficulty.subjectWorkloadLift),
              }),
              el('td', { text: formatPercent(difficulty.metadataConfidence) }),
              el('td', { text: formatOneDecimal(difficulty.graphBurden) }),
              el('td', { text: formatOneDecimal(difficulty.novelty) }),
              el('td', { text: formatOneDecimal(difficulty.breadth) }),
              el('td', { text: formatOneDecimal(difficulty.retention) }),
              el('td', {
                text: formatOneDecimal(difficulty.scheduleDifficulty),
              }),
            ),
          ),
        ),
      ),
    ),
  );
}
