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
            el('th', { text: 'Latent' }),
            el('th', { text: 'Uncertainty' }),
            el('th', { text: 'Evidence' }),
            el('th', { text: 'Workload prior' }),
            el('th', { text: 'Workload lift' }),
            el('th', { text: 'Graph lift' }),
            el('th', { text: 'Learner' }),
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
              el('td', { text: formatOneDecimal(difficulty.latentWorkload) }),
              el('td', { text: formatPercent(difficulty.workloadUncertainty) }),
              el('td', { text: formatPercent(difficulty.evidenceConfidence) }),
              el('td', {
                text: formatOneDecimal(difficulty.subjectWorkloadPrior),
              }),
              el('td', {
                text: formatOneDecimal(difficulty.subjectWorkloadLift),
              }),
              el('td', { text: formatOneDecimal(difficulty.graphWorkloadLift) }),
              el('td', {
                text: formatOneDecimal(difficulty.learnerCalibrationLift),
              }),
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
