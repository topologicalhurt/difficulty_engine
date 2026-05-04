import type { DifficultyMappingViewModel } from '../app/selectors/constraints';
import { el } from './dom';
import { svgEl } from './graph-svg';

const DIFFICULTY_CHART = {
  x: 56,
  y: 30,
  width: 292,
  height: 176,
  legendX: 372,
};

function chartPoint(raw: number, mapped: number): { x: number; y: number } {
  return {
    x: DIFFICULTY_CHART.x + ((raw - 1) / 9) * DIFFICULTY_CHART.width,
    y: DIFFICULTY_CHART.y + DIFFICULTY_CHART.height - ((mapped - 1) / 9) * DIFFICULTY_CHART.height,
  };
}

function pathFor(points: Array<{ rawDifficulty: number; displayDifficulty: number }>): string {
  return points
    .map((point, index) => {
      const pos = chartPoint(point.rawDifficulty, point.displayDifficulty);
      return `${index ? 'L' : 'M'} ${pos.x.toFixed(1)} ${pos.y.toFixed(1)}`;
    })
    .join(' ');
}

function renderCurveGuide(
  guide: DifficultyMappingViewModel['floorGuide'],
  label: string,
): SVGElement[] {
  if (!guide) return [];
  const x = chartPoint(guide.rawDifficulty, 1).x;
  const labelNode = svgEl('text', {
    x: (x + 4).toFixed(1),
    y: String(DIFFICULTY_CHART.y + 12),
    class: 'difficulty-map-guide-label',
  });
  labelNode.textContent = label;
  return [
    svgEl('line', {
      x1: x.toFixed(1),
      y1: String(DIFFICULTY_CHART.y),
      x2: x.toFixed(1),
      y2: String(DIFFICULTY_CHART.y + DIFFICULTY_CHART.height),
      class: 'difficulty-map-guide',
    }),
    labelNode,
  ];
}

function axisNodes(): SVGElement[] {
  const labels = [
    svgEl('text', { x: '262', y: '226', class: 'chart-axis-label' }),
    svgEl('text', { x: '12', y: '28', class: 'chart-axis-label' }),
    svgEl('text', { x: '52', y: '226', class: 'chart-axis-label' }),
    svgEl('text', { x: '340', y: '226', class: 'chart-axis-label' }),
  ];
  labels[0]!.textContent = 'Raw difficulty';
  labels[1]!.textContent = 'Mapped difficulty';
  labels[2]!.textContent = '1';
  labels[3]!.textContent = '10';
  return [
    svgEl('line', { x1: '56', y1: '206', x2: '348', y2: '206', class: 'chart-axis' }),
    svgEl('line', { x1: '56', y1: '30', x2: '56', y2: '206', class: 'chart-axis' }),
    ...labels,
  ];
}

function legendText(x: string, y: string, text: string): SVGTextElement {
  const node = svgEl('text', { x, y, class: 'difficulty-map-legend-label' });
  node.textContent = text;
  return node;
}

function legendNodes(labels: string[]): SVGElement[] {
  return [
    svgEl('rect', {
      x: '368',
      y: '44',
      width: '136',
      height: '92',
      rx: '6',
      class: 'difficulty-map-legend-box',
    }),
    svgEl('line', { x1: '382', y1: '68', x2: '412', y2: '68', class: 'difficulty-map-identity' }),
    legendText('420', '72', labels[0] ?? 'Identity'),
    svgEl('line', { x1: '382', y1: '94', x2: '412', y2: '94', class: 'difficulty-map-curve' }),
    legendText('420', '98', labels[1] ?? 'Current curve'),
    svgEl('circle', { cx: '390', cy: '120', r: '3', fill: 'hsl(158 72% 58%)', class: 'difficulty-map-dot' }),
    svgEl('circle', { cx: '402', cy: '120', r: '3', fill: 'hsl(98 72% 58%)', class: 'difficulty-map-dot' }),
    svgEl('circle', { cx: '414', cy: '120', r: '3', fill: 'hsl(38 72% 58%)', class: 'difficulty-map-dot' }),
    legendText('426', '124', labels[2] ?? 'Books'),
  ];
}

function renderBookDots(svg: SVGSVGElement, viewModel: DifficultyMappingViewModel): void {
  viewModel.books.forEach((book) => {
    const pos = chartPoint(book.rawDifficulty, book.displayDifficulty);
    const y = Math.max(42, Math.min(202, pos.y + book.plotOffset));
    const dot = svgEl('circle', {
      cx: pos.x.toFixed(1),
      cy: y.toFixed(1),
      r: '3.2',
      class: 'difficulty-map-dot',
      fill: book.color,
    });
    const title = svgEl('title', {});
    title.textContent = `${book.title}: raw ${book.rawDifficulty}, mapped ${book.displayDifficulty}`;
    dot.append(title);
    svg.append(dot);
  });
}

export function renderDifficultyMappingChart(viewModel: DifficultyMappingViewModel): HTMLElement {
  const svg = svgEl('svg', {
    class: 'difficulty-map-svg',
    viewBox: '0 0 520 250',
    role: 'img',
    'aria-label': 'Difficulty mapping curve',
  });
  svg.append(
    ...axisNodes(),
    ...renderCurveGuide(viewModel.floorGuide, 'floor'),
    ...renderCurveGuide(viewModel.ceilingGuide, 'ceiling'),
    svgEl('path', { d: pathFor(viewModel.identity), class: 'difficulty-map-identity' }),
    svgEl('path', { d: pathFor(viewModel.curve), class: 'difficulty-map-curve' }),
    ...legendNodes(viewModel.legendLabels),
  );
  renderBookDots(svg, viewModel);
  return el(
    'div',
    { className: 'difficulty-map-panel' },
    el('div', {
      className: 'chart-card-copy muted-copy',
      text: `${viewModel.modeExplanation} Dots are lightly offset so books remain visible when they sit directly on the curve.`,
    }),
    svg,
    el(
      'div',
      { className: 'difficulty-map-summary' },
      el('span', { text: `Raw spread ${viewModel.rawSpread}` }),
      el('span', { text: `Mapped spread ${viewModel.mappedSpread}` }),
      el('span', { text: `Low ${viewModel.lowestBook}` }),
      el('span', { text: `High ${viewModel.highestBook}` }),
    ),
  );
}
