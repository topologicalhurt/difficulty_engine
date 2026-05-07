import type { AppState, PlannerStore } from '../core/types';
import {
  LIBRARY_LIST_WIDTH_STEP,
  clampLibraryListWidth,
} from '../core/constants';
import { selectLibraryViewModel } from '../app/selectors/library';
import { el } from './dom';
import { renderBookEditorPanel } from './library-editor-panel';
import { renderReadingListPanel } from './library-list-panel';
import { renderLibrarySearchPanel } from './library-search-panel';

const LIBRARY_DETAIL_COLUMN = 'minmax(0, 1fr)';
const LIBRARY_RESIZE_HANDLE_WIDTH_PX = 8;

function applyLibraryListWidth(layout: HTMLElement, widthPx: number): void {
  layout.style.gridTemplateColumns = `${clampLibraryListWidth(widthPx)}px ${LIBRARY_RESIZE_HANDLE_WIDTH_PX}px ${LIBRARY_DETAIL_COLUMN}`;
}

function releaseResizePointer(handle: HTMLElement, pointerId: number): void {
  if (
    typeof handle.hasPointerCapture === 'function' &&
    !handle.hasPointerCapture(pointerId)
  ) {
    return;
  }
  if (typeof handle.releasePointerCapture === 'function') {
    handle.releasePointerCapture(pointerId);
  }
}

function renderResizeHandle(store: PlannerStore, layout: HTMLElement): HTMLElement {
  const handle = el('div', {
    className: 'split-resize-handle',
    role: 'separator',
    tabIndex: 0,
    ariaLabel: 'Resize reading list panel',
  });
  handle.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (typeof handle.setPointerCapture === 'function') {
      handle.setPointerCapture(event.pointerId);
    }
    let draftWidth = store.selectors.getState().ui.libraryListWidthPx;
    const layoutLeft = layout.getBoundingClientRect().left;
    const move = (moveEvent: PointerEvent): void => {
      draftWidth = clampLibraryListWidth(moveEvent.clientX - layoutLeft);
      applyLibraryListWidth(layout, draftWidth);
    };
    const cleanup = (pointerId: number): void => {
      releaseResizePointer(handle, pointerId);
      globalThis.removeEventListener('pointermove', move);
      globalThis.removeEventListener('pointerup', stop);
      globalThis.removeEventListener('pointercancel', cancel);
    };
    const stop = (upEvent: PointerEvent): void => {
      cleanup(upEvent.pointerId);
      store.commands.setLibraryListWidth(draftWidth);
    };
    const cancel = (cancelEvent: PointerEvent): void => {
      cleanup(cancelEvent.pointerId);
      applyLibraryListWidth(
        layout,
        store.selectors.getState().ui.libraryListWidthPx,
      );
    };
    globalThis.addEventListener('pointermove', move);
    globalThis.addEventListener('pointerup', stop);
    globalThis.addEventListener('pointercancel', cancel);
  });
  handle.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const delta =
      event.key === 'ArrowLeft'
        ? -LIBRARY_LIST_WIDTH_STEP
        : LIBRARY_LIST_WIDTH_STEP;
    store.commands.setLibraryListWidth(
      store.selectors.getState().ui.libraryListWidthPx + delta,
    );
  });
  return handle;
}

export function renderLibraryView(
  state: AppState,
  store: PlannerStore,
): HTMLElement {
  const viewModel = selectLibraryViewModel(state);

  const view = el(
    'div',
    {
      className: viewModel.selectedBook
        ? 'split-layout library-resizable-layout'
        : 'stack-layout',
    },
    el(
      'div',
      {
        className: 'stack-layout library-list-column',
      },
      renderLibrarySearchPanel(state, store, { title: 'Search and import' }),
      renderReadingListPanel(viewModel, store),
    ),
    viewModel.selectedBook
      ? renderBookEditorPanel(state, viewModel.editor, store)
      : null,
  );
  if (viewModel.selectedBook) {
    view.insertBefore(renderResizeHandle(store, view), view.lastElementChild);
    applyLibraryListWidth(view, viewModel.listWidthPx);
  }
  return view;
}
