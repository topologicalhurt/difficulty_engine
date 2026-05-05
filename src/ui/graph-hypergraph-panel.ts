import type { GraphRenderModel } from '../app/selectors/graph-render-data';
import { colorForGroup } from './format';
import { GRAPH_HYPERGRAPH_LAYOUT } from './graph-layout';
import { svgEl } from './graph-svg';

export function renderHypergraphSvg(
  model: GraphRenderModel,
): SVGSVGElement | null {
  const clusters = model.overlapClusters;
  const books = model.books;
  if (!clusters.length && books.length < 2) return null;

  const width = GRAPH_HYPERGRAPH_LAYOUT.width;
  const height = clusters.length
    ? Math.max(
        GRAPH_HYPERGRAPH_LAYOUT.minHeight,
        clusters.length * GRAPH_HYPERGRAPH_LAYOUT.clusterHeight + 40,
      )
    : GRAPH_HYPERGRAPH_LAYOUT.minHeight;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'graph-svg',
    role: 'img',
    'aria-label': 'Shared-topic hypergraph',
  });

  if (!clusters.length) {
    renderNoOverlapIslands(svg, books, width, height);
    return svg;
  }
  clusters.forEach((cluster, index) =>
    renderOverlapCluster(svg, model, cluster, index),
  );
  return svg;
}

function renderNoOverlapIslands(
  svg: SVGSVGElement,
  books: GraphRenderModel['books'],
  width: number,
  height: number,
): void {
  const center = { x: width / 2, y: height / 2 };
  svg.append(
    svgEl('circle', {
      cx: String(center.x),
      cy: String(center.y),
      r: '42',
      fill: 'rgba(249, 204, 99, 0.08)',
      stroke: 'rgba(249, 204, 99, 0.7)',
      'stroke-width': '1.5',
      'stroke-dasharray': '6 5',
    }),
  );
  const title = svgEl('text', {
    x: String(center.x),
    y: String(center.y - 4),
    fill: '#eef4ff',
    'font-size': '12',
    'text-anchor': 'middle',
  });
  title.textContent = 'No strong overlap hubs';
  const detail = svgEl('text', {
    x: String(center.x),
    y: String(center.y + 14),
    fill: 'rgba(151, 169, 202, 0.95)',
    'font-size': '10',
    'text-anchor': 'middle',
  });
  detail.textContent = 'Books are shown as separate topic islands.';
  svg.append(title, detail);
  books.slice(0, 12).forEach((book, index, visibleBooks) => {
    const angle =
      (Math.PI * 2 * index) / Math.max(visibleBooks.length, 1) - Math.PI / 2;
    const x = center.x + Math.cos(angle) * 230;
    const y = center.y + Math.sin(angle) * 110;
    renderBookBox(svg, book.short, book.displayGroup, x - 48, y - 15, 96, 30);
  });
}

function renderOverlapCluster(
  svg: SVGSVGElement,
  model: GraphRenderModel,
  cluster: GraphRenderModel['overlapClusters'][number],
  index: number,
): void {
  const centerY = 95 + index * GRAPH_HYPERGRAPH_LAYOUT.clusterHeight;
  const hubX = GRAPH_HYPERGRAPH_LAYOUT.hubX;
  const hub = svgEl('circle', {
    cx: String(hubX),
    cy: String(centerY),
    r: '16',
    fill: 'rgba(111, 211, 163, 0.16)',
    stroke: 'rgba(111, 211, 163, 0.82)',
    'stroke-width': '2',
  });
  const hubLabel = svgEl('text', {
    x: String(hubX),
    y: String(centerY + 4),
    fill: '#eef4ff',
    'font-size': '10',
    'text-anchor': 'middle',
  });
  hubLabel.textContent = `O${index + 1}`;
  svg.append(hub, hubLabel);

  const clusterText = svgEl('text', {
    x: '28',
    y: String(centerY + 4),
    fill: 'rgba(151, 169, 202, 0.92)',
    'font-size': '11',
  });
  clusterText.textContent =
    cluster.topicIds.slice(0, 3).join(', ') || 'shared topics';
  svg.append(clusterText);

  cluster.bookIds.forEach((bookId, bookIndex) => {
    const book = model.books.find((candidate) => candidate.id === bookId);
    if (!book) return;
    const total = Math.max(1, cluster.bookIds.length);
    const angle =
      total === 1
        ? 0
        : -Math.PI * 0.62 +
          (Math.PI * 1.24 * bookIndex) / Math.max(1, total - 1);
    const x = hubX + 235 + Math.cos(angle) * 78;
    const y = centerY + Math.sin(angle) * 62 - 18;
    svg.append(
      svgEl('path', {
        d: `M ${hubX + 16} ${centerY} Q ${hubX + 125} ${centerY + Math.sin(angle) * 48}, ${x} ${y + 18}`,
        fill: 'none',
        stroke: 'rgba(96, 165, 250, 0.52)',
        'stroke-width': '1.5',
      }),
    );
    renderBookBox(svg, book.short, book.displayGroup, x, y, 108, 36);
  });
}

function renderBookBox(
  svg: SVGSVGElement,
  labelText: string,
  displayGroup: string,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  svg.append(
    svgEl('rect', {
      x: String(x),
      y: String(y),
      rx: '4',
      ry: '4',
      width: String(width),
      height: String(height),
      fill: 'rgba(15, 23, 42, 0.96)',
      stroke: colorForGroup(displayGroup),
      'stroke-width': '1.5',
    }),
  );
  const label = svgEl('text', {
    x: String(x + (width === 96 ? width / 2 : 8)),
    y: String(y + (height === 30 ? 19 : 22)),
    fill: '#eef4ff',
    'font-size': '10',
    ...(width === 96 ? { 'text-anchor': 'middle' } : {}),
  });
  label.textContent = labelText;
  svg.append(label);
}
