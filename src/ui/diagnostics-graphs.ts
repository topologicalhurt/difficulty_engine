import type { GraphRenderModel } from '../app/selectors/graph-render-data';
import { el, emptyState } from './dom';
import { renderDagSvg } from './graph-dag-panel';
import { renderHypergraphSvg } from './graph-hypergraph-panel';
import { renderNetworkSvg } from './graph-network-panel';
import { renderInteractiveGraphCard } from './graph-viewport';

export function renderGraphPanels(model: GraphRenderModel): HTMLElement {
  const dag = renderDagSvg(model);
  const network = renderNetworkSvg(model);
  const hypergraph = renderHypergraphSvg(model);

  return el(
    'div',
    { className: 'planner-chart-grid diagnostics-graph-grid' },
    dag
      ? renderInteractiveGraphCard(
          'dag',
          'Prerequisite DAG',
          'Prerequisite flow from foundational books to later books. Drag to pan and wheel to zoom.',
          dag,
        )
      : emptyState(
          'No DAG to show',
          'Prerequisite edges appear here once the solver infers them.',
        ),
    network
      ? renderInteractiveGraphCard(
          'network',
          'Relation network',
          'Green lines are prerequisite flow, blue hubs show co-study groups, amber lines show references.',
          network,
        )
      : emptyState(
          'No network to show',
          'Relation links appear here once the library has enough evidence.',
        ),
    hypergraph
      ? renderInteractiveGraphCard(
          'hypergraph',
          'Topic overlap explorer',
          'Matrix columns show shared topic intersections; colored dots show which books participate.',
          hypergraph,
        )
      : emptyState(
          'No overlap explorer to show',
          'Overlap clusters appear here once books share enough topic evidence.',
        ),
  );
}
