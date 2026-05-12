import { button, el, panel } from './dom';
import { formatPercent } from './format';

type GraphViewportState = {
  zoom: number;
  panX: number;
  panY: number;
};

const DEFAULT_VIEWPORT: GraphViewportState = { zoom: 1, panX: 0, panY: 0 };
const viewportById = new Map<string, GraphViewportState>();
const MIN_ZOOM = 0.55;
const MAX_ZOOM = 2.8;
const ZOOM_STEP = 0.2;

function stateFor(id: string): GraphViewportState {
  const current = viewportById.get(id);
  if (current) {
    return current;
  }
  const initial = { ...DEFAULT_VIEWPORT };
  viewportById.set(id, initial);
  return initial;
}

function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(zoom * 100) / 100));
}

function applyTransform(content: HTMLElement, state: GraphViewportState): void {
  content.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
}

function attachPanZoom(
  frame: HTMLElement,
  content: HTMLElement,
  id: string,
  onChange: () => void,
): void {
  const state = stateFor(id);
  applyTransform(content, state);

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originPanX = state.panX;
  let originPanY = state.panY;

  frame.addEventListener('wheel', (event) => {
    event.preventDefault();
    const nextZoom = clampZoom(
      state.zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP),
    );
    if (nextZoom === state.zoom) {
      return;
    }
    state.zoom = nextZoom;
    onChange();
  });

  frame.addEventListener('pointerdown', (event) => {
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    originPanX = state.panX;
    originPanY = state.panY;
    frame.setPointerCapture(event.pointerId);
    frame.dataset.dragging = 'true';
  });

  frame.addEventListener('pointermove', (event) => {
    if (!dragging) {
      return;
    }
    state.panX = originPanX + (event.clientX - startX);
    state.panY = originPanY + (event.clientY - startY);
    onChange();
  });

  const endDrag = (event: PointerEvent): void => {
    if (!dragging) {
      return;
    }
    dragging = false;
    frame.releasePointerCapture(event.pointerId);
    delete frame.dataset.dragging;
  };

  frame.addEventListener('pointerup', endDrag);
  frame.addEventListener('pointercancel', endDrag);
}

function viewportButton(label: string, onClick: () => void): HTMLButtonElement {
  return button(label, {
    className: 'ghost-button graph-control-button',
    onClick,
  });
}

export function renderInteractiveGraphCard(
  id: string,
  title: string,
  hint: string,
  graphic: SVGSVGElement,
): HTMLElement {
  const state = stateFor(id);
  const content = el('div', { className: 'graph-viewport-content' }, graphic);
  const frame = el(
    'div',
    {
      className: 'graph-viewport-frame',
      dataset: { graphId: id },
      title: 'Drag to pan. Use mouse wheel to zoom.',
    },
    content,
  );
  const refresh = (): void => {
    applyTransform(content, state);
    zoomButton.textContent = formatPercent(state.zoom);
  };
  const reset = (): void => {
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    refresh();
  };
  const zoomButton = viewportButton(formatPercent(state.zoom), reset);
  attachPanZoom(frame, content, id, refresh);
  refresh();

  return panel(
    title,
    { id: `graph:${id}`, className: 'graph-panel' },
    el(
      'div',
      { className: 'toolbar-row' },
      el('div', { className: 'graph-hint muted-copy', text: hint }),
      el('div', { className: 'detail-spacer' }),
      viewportButton('Fit', reset),
      viewportButton('−', () => {
        state.zoom = clampZoom(state.zoom - ZOOM_STEP);
        refresh();
      }),
      zoomButton,
      viewportButton('+', () => {
        state.zoom = clampZoom(state.zoom + ZOOM_STEP);
        refresh();
      }),
    ),
    frame,
  );
}
