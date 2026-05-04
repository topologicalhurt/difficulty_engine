import type { OverlapDiffView } from '../app/selectors/diagnostics';
import { badge, card, el } from './dom';
import { formatOneDecimal, formatPercent } from './format';

export function renderOverlapDiffDiagnostics(overlapDiffs: OverlapDiffView[]): HTMLElement {
  return card(
    'Skim diffs',
    overlapDiffs.length
      ? el(
          'div',
          { className: 'stack-layout' },
          ...overlapDiffs.map((diff) =>
            el(
              'div',
              { className: 'diff-card' },
              el(
                'div',
                { className: 'diff-card-head' },
                el(
                  'div',
                  { className: 'stack-layout compact-stack' },
                  el('strong', {
                    text: `${diff.bookLabel} vs ${diff.anchorLabel}`,
                  }),
                  el('div', {
                    className: 'muted-copy',
                    text: diff.reason,
                  }),
                ),
                el(
                  'div',
                  { className: 'badge-row compact-badge-row' },
                  badge(`${formatOneDecimal(diff.timeSaved)}h saved`, 'success'),
                  badge(`${formatPercent(diff.confidence)} confidence`),
                  badge(`${formatPercent(diff.overlapFrac)} overlap`),
                ),
              ),
              el(
                'div',
                { className: 'diff-grid' },
                el(
                  'div',
                  { className: 'diff-pane' },
                  el('div', { className: 'diff-pane-label', text: diff.anchorLabel }),
                  el(
                    'div',
                    { className: 'diff-topic-list' },
                    ...diff.anchorTopics.map((topic) => badge(topic)),
                  ),
                ),
                el(
                  'div',
                  { className: 'diff-pane diff-pane-added' },
                  el('div', { className: 'diff-pane-label', text: `${diff.bookLabel} skim candidates` }),
                  el(
                    'div',
                    { className: 'diff-topic-list' },
                    ...diff.skimTopics.map((topic) => badge(topic, 'warn')),
                  ),
                ),
              ),
            ),
          ),
        )
      : el('div', { className: 'muted-copy', text: 'No overlap-based skim diffs yet.' }),
  );
}
