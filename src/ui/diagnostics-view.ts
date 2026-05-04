import { selectDiagnosticsViewModel } from '../app/selectors/diagnostics';
import type { AppState } from '../core/types';
import { renderAuditSummary } from './diagnostics-audit-section';
import { renderDifficultyDiagnostics } from './diagnostics-difficulty-section';
import { renderOverlapDiffDiagnostics } from './diagnostics-overlap-section';
import { renderRelationsDiagnostics } from './diagnostics-relations-section';
import { renderWorkloadClusterDiagnostics } from './diagnostics-workload-section';
import { el } from './dom';

export function renderDiagnosticsView(state: AppState): HTMLElement {
  const viewModel = selectDiagnosticsViewModel(state);
  return el(
    'div',
    { className: 'stack-layout' },
    renderAuditSummary(viewModel.passes, viewModel.warnings, viewModel.failures),
    renderRelationsDiagnostics(viewModel.relations),
    renderWorkloadClusterDiagnostics(viewModel.workloadClusters),
    renderOverlapDiffDiagnostics(viewModel.overlapDiffs),
    renderDifficultyDiagnostics(viewModel.difficultyRows),
  );
}
