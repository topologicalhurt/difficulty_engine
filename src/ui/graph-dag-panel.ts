import type { GraphRenderModel } from '../app/selectors/graph-render-data';
import { colorForGroup } from './format';
import { GRAPH_DAG_LAYOUT } from './graph-layout';
import { appendGraphArrowMarkers, markerUrl, svgEl } from './graph-svg';

export function renderDagSvg(model: GraphRenderModel): SVGSVGElement | null {
  const nodes = model.nodes;
  const edges = model.prerequisiteEdges;
  if (!nodes.length) return null;

  const columns = new Map<number, typeof nodes>();
  nodes.forEach((node) => {
    const depth = Math.max(0, node.dep || 0);
    const column = columns.get(depth) ?? [];
    column.push(node);
    columns.set(depth, column);
  });

  const positions = new Map<string, { x: number; y: number }>();
  let maxRows = 0;
  Array.from(columns.entries())
    .sort((left, right) => left[0] - right[0])
    .forEach(([depth, column]) => {
      maxRows = Math.max(maxRows, column.length);
      column.forEach((item, index) => {
        positions.set(item.id, {
          x: 40 + depth * GRAPH_DAG_LAYOUT.columnWidth,
          y:
            36 +
            index *
              (GRAPH_DAG_LAYOUT.nodeHeight + GRAPH_DAG_LAYOUT.nodeVerticalGap),
        });
      });
    });
  const width = Math.max(
    GRAPH_DAG_LAYOUT.minWidth,
    columns.size * GRAPH_DAG_LAYOUT.columnWidth + 120,
  );
  const height = Math.max(
    GRAPH_DAG_LAYOUT.minHeight,
    maxRows * (GRAPH_DAG_LAYOUT.nodeHeight + GRAPH_DAG_LAYOUT.nodeVerticalGap) +
      80,
  );
  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'graph-svg',
    role: 'img',
    'aria-label': 'Prerequisite DAG',
  });
  appendGraphArrowMarkers(svg, 'dag');
  renderPartitionBoxes(svg, model, positions);
  renderResearchChainBoxes(svg, model, positions);
  renderPrerequisiteEdges(svg, edges, positions);
  renderCoStudyEdges(svg, model.coStudyEdges, positions);
  renderDepthLabels(svg, columns);
  renderDagNodes(svg, nodes, positions);
  return svg;
}

function renderPartitionBoxes(
  svg: SVGSVGElement,
  model: GraphRenderModel,
  positions: Map<string, { x: number; y: number }>,
): void {
  model.displayGroupPartitions.forEach((partition) => {
    const partitionPositions = partition.ids
      .map((id) => positions.get(id))
      .filter((position): position is { x: number; y: number } =>
        Boolean(position),
      );
    if (!partitionPositions.length) return;
    const minX =
      Math.min(...partitionPositions.map((position) => position.x)) - 8;
    const maxX =
      Math.max(
        ...partitionPositions.map(
          (position) => position.x + GRAPH_DAG_LAYOUT.nodeWidth,
        ),
      ) + 8;
    const minY =
      Math.min(...partitionPositions.map((position) => position.y)) - 8;
    const maxY =
      Math.max(
        ...partitionPositions.map(
          (position) => position.y + GRAPH_DAG_LAYOUT.nodeHeight,
        ),
      ) + 8;
    svg.append(
      svgEl('rect', {
        x: String(minX),
        y: String(minY),
        width: String(maxX - minX),
        height: String(maxY - minY),
        rx: '7',
        ry: '7',
        fill: 'rgba(255, 255, 255, 0.018)',
        stroke: colorForGroup(partition.label),
        'stroke-width': '1',
        'stroke-dasharray': '3 5',
      }),
    );
  });
}

function renderResearchChainBoxes(
  svg: SVGSVGElement,
  model: GraphRenderModel,
  positions: Map<string, { x: number; y: number }>,
): void {
  model.researchChains.forEach((chain, index) => {
    const chainPositions = chain.ids
      .map((id) => positions.get(id))
      .filter((position): position is { x: number; y: number } =>
        Boolean(position),
      );
    if (chainPositions.length < 2) return;
    const minX = Math.min(...chainPositions.map((position) => position.x)) - 14;
    const maxX =
      Math.max(
        ...chainPositions.map(
          (position) => position.x + GRAPH_DAG_LAYOUT.nodeWidth,
        ),
      ) + 14;
    const minY = Math.min(...chainPositions.map((position) => position.y)) - 14;
    const maxY =
      Math.max(
        ...chainPositions.map(
          (position) => position.y + GRAPH_DAG_LAYOUT.nodeHeight,
        ),
      ) + 14;
    svg.append(
      svgEl('rect', {
        x: String(minX),
        y: String(minY),
        width: String(maxX - minX),
        height: String(maxY - minY),
        rx: '6',
        ry: '6',
        fill: 'rgba(249, 204, 99, 0.045)',
        stroke: 'rgba(249, 204, 99, 0.85)',
        'stroke-width': '1.5',
        'stroke-dasharray': '7 5',
      }),
    );
    const label = svgEl('text', {
      x: String(minX + 10),
      y: String(minY + 16),
      fill: 'rgba(249, 204, 99, 0.95)',
      'font-size': '10',
    });
    label.textContent = `Research chain ${index + 1}`;
    svg.append(label);
  });
}

function renderPrerequisiteEdges(
  svg: SVGSVGElement,
  edges: GraphRenderModel['prerequisiteEdges'],
  positions: Map<string, { x: number; y: number }>,
): void {
  edges.forEach((edge) => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) return;
    svg.append(
      svgEl('path', {
        d: `M ${from.x + GRAPH_DAG_LAYOUT.nodeWidth} ${from.y + GRAPH_DAG_LAYOUT.nodeHeight / 2} C ${from.x + GRAPH_DAG_LAYOUT.nodeWidth + 38} ${from.y + GRAPH_DAG_LAYOUT.nodeHeight / 2}, ${to.x - 38} ${to.y + GRAPH_DAG_LAYOUT.nodeHeight / 2}, ${to.x} ${to.y + GRAPH_DAG_LAYOUT.nodeHeight / 2}`,
        fill: 'none',
        stroke: 'rgba(148, 163, 184, 0.65)',
        'stroke-width': '2',
        'marker-start': markerUrl('dag', 'required-by'),
        'marker-end': markerUrl('dag', 'prereq'),
      }),
    );
  });
}

function renderCoStudyEdges(
  svg: SVGSVGElement,
  edges: GraphRenderModel['coStudyEdges'],
  positions: Map<string, { x: number; y: number }>,
): void {
  edges.forEach((edge) => {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) return;
    svg.append(
      svgEl('path', {
        d: `M ${from.x + GRAPH_DAG_LAYOUT.nodeWidth / 2} ${from.y + GRAPH_DAG_LAYOUT.nodeHeight} C ${from.x + GRAPH_DAG_LAYOUT.nodeWidth / 2} ${from.y + GRAPH_DAG_LAYOUT.nodeHeight + 28}, ${to.x + GRAPH_DAG_LAYOUT.nodeWidth / 2} ${to.y - 28}, ${to.x + GRAPH_DAG_LAYOUT.nodeWidth / 2} ${to.y}`,
        fill: 'none',
        stroke: 'rgba(96, 165, 250, 0.55)',
        'stroke-width': '1.7',
        'stroke-dasharray': '5 4',
        'marker-start': markerUrl('dag', 'costudy'),
        'marker-end': markerUrl('dag', 'costudy'),
      }),
    );
  });
}

function renderDepthLabels(
  svg: SVGSVGElement,
  columns: Map<number, GraphRenderModel['nodes']>,
): void {
  Array.from(columns.entries())
    .sort((left, right) => left[0] - right[0])
    .forEach(([depth]) => {
      const text = svgEl('text', {
        x: String(40 + depth * GRAPH_DAG_LAYOUT.columnWidth),
        y: '20',
        fill: 'rgba(151, 169, 202, 0.95)',
        'font-size': '11',
      });
      text.textContent = `Depth ${depth}`;
      svg.append(text);
    });
}

function renderDagNodes(
  svg: SVGSVGElement,
  nodes: GraphRenderModel['nodes'],
  positions: Map<string, { x: number; y: number }>,
): void {
  nodes.forEach((node) => {
    const position = positions.get(node.id);
    if (!position) return;
    const color = colorForGroup(node.displayGroup);
    const rect = svgEl('rect', {
      x: String(position.x),
      y: String(position.y),
      rx: '4',
      ry: '4',
      width: String(GRAPH_DAG_LAYOUT.nodeWidth),
      height: String(GRAPH_DAG_LAYOUT.nodeHeight),
      fill: 'rgba(15, 23, 42, 0.92)',
      stroke: color,
      'stroke-width': '1.5',
    });
    const label = svgEl('text', {
      x: String(position.x + 8),
      y: String(position.y + 21),
      fill: '#eef4ff',
      'font-size': '11',
    });
    label.textContent = node.short;
    svg.append(rect, label);
  });
}
