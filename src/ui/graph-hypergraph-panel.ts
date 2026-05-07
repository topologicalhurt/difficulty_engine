import type { GraphRenderModel } from '../app/selectors/graph-render-data';
import { colorForGroup, formatPercent, round0 } from './format';
import { svgEl } from './graph-svg';

const MATRIX_WIDTH = 920;
const MATRIX_MIN_HEIGHT = 320;
const LEFT_LABEL_WIDTH = 220;
const TOP_LABEL_HEIGHT = 116;
const ROW_HEIGHT = 28;
const COLUMN_WIDTH = 68;
const MAX_VISIBLE_CLUSTERS = 10;
const MAX_VISIBLE_BOOKS = 16;

export function renderHypergraphSvg(
  model: GraphRenderModel,
): SVGSVGElement | null {
  const clusters = model.overlapExplorer.clusters.slice(0, MAX_VISIBLE_CLUSTERS);
  const books = model.overlapExplorer.bookRows.slice(0, MAX_VISIBLE_BOOKS);
  if (!clusters.length) return renderOverlapEmptyState(model);

  const width = Math.max(
    MATRIX_WIDTH,
    LEFT_LABEL_WIDTH + clusters.length * COLUMN_WIDTH + 48,
  );
  const height = Math.max(
    MATRIX_MIN_HEIGHT,
    TOP_LABEL_HEIGHT + books.length * ROW_HEIGHT + 72,
  );
  const svg = svgEl('svg', {
    viewBox: `0 0 ${width} ${height}`,
    class: 'graph-svg',
    role: 'img',
    'aria-label': 'Topic overlap explorer matrix',
  });

  renderMatrixHeader(svg, clusters);
  books.forEach((book, rowIndex) => {
    renderBookRow(svg, book, rowIndex, clusters);
  });
  renderMatrixLegend(svg, height, clusters.length, model);
  return svg;
}

function renderOverlapEmptyState(model: GraphRenderModel): SVGSVGElement | null {
  if (model.books.length < 2) return null;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${MATRIX_WIDTH} ${MATRIX_MIN_HEIGHT}`,
    class: 'graph-svg',
    role: 'img',
    'aria-label': 'Topic overlap explorer empty state',
  });
  const title = svgEl('text', {
    x: '36',
    y: '118',
    fill: '#eef4ff',
    'font-size': '18',
    'font-weight': '700',
  });
  title.textContent = 'No strong topic intersections yet';
  const detail = svgEl('text', {
    x: '36',
    y: '146',
    fill: 'rgba(151, 169, 202, 0.95)',
    'font-size': '12',
  });
  detail.textContent =
    model.overlapExplorer.emptyStateReason ??
    'Add subjects, descriptions, or table-of-contents data to improve overlap detection.';
  svg.append(title, detail);
  model.books.slice(0, 10).forEach((book, index) => {
    const x = 42 + (index % 5) * 166;
    const y = 188 + Math.floor(index / 5) * 54;
    renderBookPill(svg, book.short, book.displayGroup, x, y);
  });
  return svg;
}

function renderMatrixHeader(
  svg: SVGSVGElement,
  clusters: GraphRenderModel['overlapExplorer']['clusters'],
): void {
  const title = svgEl('text', {
    x: '24',
    y: '30',
    fill: '#eef4ff',
    'font-size': '16',
    'font-weight': '700',
  });
  title.textContent = 'Topic overlap explorer';
  const subtitle = svgEl('text', {
    x: '24',
    y: '52',
    fill: 'rgba(151, 169, 202, 0.95)',
    'font-size': '11',
  });
  subtitle.textContent =
    'Columns are shared topic intersections; dots show which books participate.';
  svg.append(title, subtitle);

  clusters.forEach((cluster, index) => {
    const x = LEFT_LABEL_WIDTH + index * COLUMN_WIDTH + COLUMN_WIDTH / 2;
    const barHeight = Math.min(42, 12 + cluster.bookIds.length * 7);
    svg.append(
      svgEl('rect', {
        x: String(x - 14),
        y: String(TOP_LABEL_HEIGHT - 50 - barHeight),
        width: '28',
        height: String(barHeight),
        rx: '4',
        fill: 'rgba(96, 165, 250, 0.5)',
      }),
    );
    const label = svgEl('text', {
      x: String(x),
      y: String(TOP_LABEL_HEIGHT - 42),
      fill: '#eef4ff',
      'font-size': '9',
      'text-anchor': 'middle',
      transform: `rotate(-35 ${x} ${TOP_LABEL_HEIGHT - 42})`,
    });
    label.textContent = cluster.label.slice(0, 24);
    label.append(titleNode(clusterTitle(cluster)));
    svg.append(label);
  });
}

function renderBookRow(
  svg: SVGSVGElement,
  book: GraphRenderModel['overlapExplorer']['bookRows'][number],
  rowIndex: number,
  clusters: GraphRenderModel['overlapExplorer']['clusters'],
): void {
  const y = TOP_LABEL_HEIGHT + rowIndex * ROW_HEIGHT;
  svg.append(
    svgEl('line', {
      x1: '20',
      y1: String(y + ROW_HEIGHT / 2),
      x2: String(LEFT_LABEL_WIDTH + clusters.length * COLUMN_WIDTH),
      y2: String(y + ROW_HEIGHT / 2),
      stroke: 'rgba(148, 163, 184, 0.1)',
      'stroke-width': '1',
    }),
  );
  renderBookPill(svg, book.short, book.displayGroup, 24, y + 4);

  clusters.forEach((cluster, index) => {
    const x = LEFT_LABEL_WIDTH + index * COLUMN_WIDTH + COLUMN_WIDTH / 2;
    const participates = cluster.bookIds.includes(book.id);
    if (participates) {
      const dot = svgEl('circle', {
        cx: String(x),
        cy: String(y + ROW_HEIGHT / 2),
        r: '6',
        fill: colorForGroup(book.displayGroup),
        stroke: '#0f172a',
        'stroke-width': '1.5',
      });
      dot.append(titleNode(`${book.title} participates in ${cluster.label}`));
      svg.append(dot);
      return;
    }
    svg.append(
      svgEl('circle', {
        cx: String(x),
        cy: String(y + ROW_HEIGHT / 2),
        r: '2',
        fill: 'rgba(148, 163, 184, 0.28)',
      }),
    );
  });
}

function renderBookPill(
  svg: SVGSVGElement,
  label: string,
  displayGroup: string,
  x: number,
  y: number,
): void {
  svg.append(
    svgEl('rect', {
      x: String(x),
      y: String(y),
      rx: '4',
      width: '168',
      height: '20',
      fill: 'rgba(15, 23, 42, 0.95)',
      stroke: colorForGroup(displayGroup),
      'stroke-width': '1',
    }),
  );
  const text = svgEl('text', {
    x: String(x + 8),
    y: String(y + 14),
    fill: '#eef4ff',
    'font-size': '10',
  });
  text.textContent = label.slice(0, 28);
  svg.append(text);
}

function renderMatrixLegend(
  svg: SVGSVGElement,
  height: number,
  visibleClusterCount: number,
  model: GraphRenderModel,
): void {
  const moreClusters =
    model.overlapExplorer.clusters.length > visibleClusterCount
      ? ` · ${model.overlapExplorer.clusters.length - visibleClusterCount} more hidden`
      : '';
  const legend = svgEl('text', {
    x: '24',
    y: String(height - 28),
    fill: 'rgba(151, 169, 202, 0.95)',
    'font-size': '11',
  });
  legend.textContent = `Bar height = books in overlap · colored dot = participating book${moreClusters}`;
  svg.append(legend);
}

function clusterTitle(
  cluster: GraphRenderModel['overlapExplorer']['clusters'][number],
): string {
  return [
    cluster.label,
    `${cluster.bookIds.length} book(s)`,
    `${cluster.topicLabels.length} topic(s)`,
    `${round0(cluster.timeSaved)} min saved`,
    `${formatPercent(cluster.confidence)} confidence`,
  ].join(' · ');
}

function titleNode(text: string): SVGTitleElement {
  const node = svgEl('title', {});
  node.textContent = text;
  return node;
}
