import type { GraphRenderModel } from '../app/selectors/graph-render-data';
import { colorForGroup } from './format';
import { GRAPH_NETWORK_LAYOUT } from './graph-layout';
import { appendGraphArrowMarkers, markerUrl, svgEl } from './graph-svg';

function relationStroke(type: string): string {
  if (type === 'prerequisite') return 'rgba(111, 211, 163, 0.55)';
  if (type === 'co-study') return 'rgba(96, 165, 250, 0.5)';
  if (type === 'reference') return 'rgba(249, 204, 99, 0.55)';
  return 'rgba(255, 123, 123, 0.55)';
}

export function renderNetworkSvg(model: GraphRenderModel): SVGSVGElement | null {
  const books = model.books;
  if (!books.length) return null;

  const { width, height } = GRAPH_NETWORK_LAYOUT;
  const centerX = width / 2;
  const centerY = height / 2;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'graph-svg',
    role: 'img',
    'aria-label': 'Relation network and co-study hypergraph',
  });
  appendGraphArrowMarkers(svg, 'network');

  const nodePositions = new Map<string, { x: number; y: number }>();
  books.forEach((book, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(books.length, 1) - Math.PI / 2;
    nodePositions.set(book.id, {
      x: centerX + Math.cos(angle) * GRAPH_NETWORK_LAYOUT.radiusX,
      y: centerY + Math.sin(angle) * GRAPH_NETWORK_LAYOUT.radiusY,
    });
  });
  renderRelationLines(svg, model, nodePositions);
  renderCoStudyHubs(svg, model, nodePositions, centerX, centerY);
  renderNetworkNodes(svg, books, nodePositions);
  return svg;
}

function renderRelationLines(
  svg: SVGSVGElement,
  model: GraphRenderModel,
  nodePositions: Map<string, { x: number; y: number }>,
): void {
  [...model.prerequisiteEdges, ...model.coStudyEdges, ...model.referenceEdges].forEach((relation) => {
    const from = nodePositions.get(relation.from);
    const to = nodePositions.get(relation.to);
    if (!from || !to) return;
    const attrs: Record<string, string> = {
      x1: String(from.x),
      y1: String(from.y),
      x2: String(to.x),
      y2: String(to.y),
      stroke: relationStroke(relation.type),
      'stroke-width': relation.type === 'prerequisite' ? '2' : '1.5',
    };
    if (relation.type === 'prerequisite') {
      attrs['marker-start'] = markerUrl('network', 'required-by');
      attrs['marker-end'] = markerUrl('network', 'prereq');
    }
    if (relation.type === 'co-study') {
      attrs['marker-start'] = markerUrl('network', 'costudy');
      attrs['marker-end'] = markerUrl('network', 'costudy');
    }
    svg.append(svgEl('line', attrs));
  });
}

function renderCoStudyHubs(
  svg: SVGSVGElement,
  model: GraphRenderModel,
  nodePositions: Map<string, { x: number; y: number }>,
  centerX: number,
  centerY: number,
): void {
  model.coStudyGroups.forEach((group, index, groups) => {
    const angle = (Math.PI * 2 * index) / Math.max(groups.length, 1) - Math.PI / 2;
    const hub = {
      x: centerX + Math.cos(angle) * GRAPH_NETWORK_LAYOUT.hubRadiusX,
      y: centerY + Math.sin(angle) * GRAPH_NETWORK_LAYOUT.hubRadiusY,
    };
    svg.append(svgEl('circle', {
      cx: String(hub.x),
      cy: String(hub.y),
      r: '11',
      fill: 'rgba(96, 165, 250, 0.22)',
      stroke: 'rgba(96, 165, 250, 0.85)',
      'stroke-width': '1.5',
    }));
    const hubLabel = svgEl('text', {
      x: String(hub.x),
      y: String(hub.y + 4),
      fill: '#eef4ff',
      'font-size': '9',
      'text-anchor': 'middle',
    });
    hubLabel.textContent = `C${index + 1}`;
    svg.append(hubLabel);
    group.ids.forEach((id) => {
      const target = nodePositions.get(id);
      if (!target) return;
      svg.append(svgEl('line', {
        x1: String(hub.x),
        y1: String(hub.y),
        x2: String(target.x),
        y2: String(target.y),
        stroke: 'rgba(96, 165, 250, 0.5)',
        'stroke-width': '1.4',
        'stroke-dasharray': '4 4',
      }));
    });
  });
}

function renderNetworkNodes(
  svg: SVGSVGElement,
  books: GraphRenderModel['books'],
  nodePositions: Map<string, { x: number; y: number }>,
): void {
  books.forEach((book) => {
    const position = nodePositions.get(book.id);
    if (!position) return;
    svg.append(svgEl('circle', {
      cx: String(position.x),
      cy: String(position.y),
      r: '16',
      fill: 'rgba(15, 23, 42, 0.96)',
      stroke: colorForGroup(book.displayGroup),
      'stroke-width': '2',
    }));
    const label = svgEl('text', {
      x: String(position.x),
      y: String(position.y + 31),
      fill: '#eef4ff',
      'font-size': '10',
      'text-anchor': 'middle',
    });
    label.textContent = book.short;
    svg.append(label);
  });
}
