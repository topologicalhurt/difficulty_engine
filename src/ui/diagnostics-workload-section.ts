import type { WorkloadClusterView } from '../app/selectors/diagnostics';
import { badge, card, el } from './dom';
import { formatOneDecimal, formatPercent } from './format';

export function renderWorkloadClusterDiagnostics(
  clusters: WorkloadClusterView[],
): HTMLElement {
  return card(
    'Workload clusters',
    clusters.length
      ? el(
          'div',
          { className: 'stack-layout' },
          ...clusters.map((cluster) =>
            el(
              'div',
              { className: 'diff-card' },
              el(
                'div',
                { className: 'diff-card-head' },
                el(
                  'div',
                  { className: 'stack-layout compact-stack' },
                  el('strong', { text: cluster.label }),
                  el('div', {
                    className: 'muted-copy',
                    text: `${cluster.bookLabels.join(', ')} · prior ${formatOneDecimal(cluster.workloadPrior)} · ${formatPercent(cluster.confidence)} confidence`,
                  }),
                ),
                el(
                  'div',
                  { className: 'badge-row compact-badge-row' },
                  ...cluster.topPhrases
                    .slice(0, 4)
                    .map((phrase) => badge(phrase)),
                ),
              ),
              el(
                'div',
                { className: 'stack-list compact-stack' },
                ...cluster.assignments.map((assignment) =>
                  el(
                    'div',
                    { className: 'stack-row' },
                    assignment.sparseSpecialized
                      ? badge('sparse lift', 'warn')
                      : badge('clustered'),
                    el('div', {
                      text: `${assignment.bookLabel}: metadata ${formatPercent(assignment.metadataConfidence)}, prior ${formatOneDecimal(assignment.subjectWorkloadPrior)}, similarity ${formatPercent(assignment.similarityToCluster)}. ${assignment.explanation}`,
                    }),
                  ),
                ),
              ),
            ),
          ),
        )
      : el('div', {
          className: 'muted-copy',
          text: 'No workload clusters yet.',
        }),
  );
}
