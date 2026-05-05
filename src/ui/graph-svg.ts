const SVG_NS = 'http://www.w3.org/2000/svg';

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([key, value]) => {
    node.setAttribute(key, value);
  });
  return node;
}

function marker(id: string, color: string, orient = 'auto'): SVGMarkerElement {
  const node = svgEl('marker', {
    id,
    viewBox: '0 0 10 10',
    refX: '9',
    refY: '5',
    markerWidth: '7',
    markerHeight: '7',
    orient,
    markerUnits: 'strokeWidth',
  });
  node.append(
    svgEl('path', {
      d: 'M 0 0 L 10 5 L 0 10 z',
      fill: color,
    }),
  );
  return node;
}

export function markerUrl(prefix: string, name: string): string {
  return `url(#${prefix}-${name})`;
}

export function appendGraphArrowMarkers(
  svg: SVGSVGElement,
  prefix: string,
): void {
  const defs = svgEl('defs', {});
  defs.append(
    marker(`${prefix}-prereq`, 'rgba(111, 211, 163, 0.82)'),
    marker(
      `${prefix}-required-by`,
      'rgba(249, 204, 99, 0.82)',
      'auto-start-reverse',
    ),
    marker(
      `${prefix}-costudy`,
      'rgba(96, 165, 250, 0.85)',
      'auto-start-reverse',
    ),
  );
  svg.append(defs);
}
