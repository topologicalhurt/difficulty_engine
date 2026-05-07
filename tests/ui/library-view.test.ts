// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { renderLibraryView } from '../../src/ui/library-view';
import { makeStore } from '../app/store-test-utils';

function pointerEvent(
  type: string,
  init: { clientX: number; pointerId?: number },
): PointerEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: init.clientX,
  });
  Object.defineProperty(event, 'pointerId', {
    configurable: true,
    value: init.pointerId ?? 1,
  });
  return event as PointerEvent;
}

describe('library view', () => {
  it('keeps book details selectable, closable, and resizeable', () => {
    const store = makeStore();
    store.commands.selectBook('book-1');
    const view = renderLibraryView(store.selectors.getState(), store);

    expect(view.textContent).toContain('Book details');
    expect(view.querySelector('.split-resize-handle')).toBeTruthy();

    view
      .querySelector('.split-resize-handle')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(store.selectors.getProject().uiPreferences.libraryListWidthPx).toBe(
      484,
    );

    const closeButton = Array.from(view.querySelectorAll('button')).find(
      (button) => button.textContent === 'Close details',
    );
    closeButton?.dispatchEvent(new MouseEvent('click'));
    expect(store.selectors.getState().ui.selectedBookId).toBeNull();
  });

  it('keeps resize dragging local until pointer release', () => {
    const store = makeStore();
    store.commands.selectBook('book-1');
    const view = renderLibraryView(store.selectors.getState(), store);
    const handle = view.querySelector('.split-resize-handle');
    if (!(handle instanceof HTMLElement)) {
      throw new Error('Expected resize handle.');
    }
    Object.defineProperty(view, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 100 }),
    });
    handle.setPointerCapture = vi.fn();
    handle.hasPointerCapture = vi.fn(() => true);
    handle.releasePointerCapture = vi.fn();

    handle.dispatchEvent(pointerEvent('pointerdown', { clientX: 560 }));
    globalThis.dispatchEvent(pointerEvent('pointermove', { clientX: 700 }));

    expect(store.selectors.getProject().uiPreferences.libraryListWidthPx).toBe(
      460,
    );
    expect(view.style.gridTemplateColumns).toContain('600px');

    globalThis.dispatchEvent(pointerEvent('pointerup', { clientX: 700 }));

    expect(store.selectors.getProject().uiPreferences.libraryListWidthPx).toBe(
      600,
    );
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(1);
  });
});
