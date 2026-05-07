// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { renderLibraryView } from '../../src/ui/library-view';
import { makeBook, makeProject, makeStore } from '../app/store-test-utils';

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

  it('renders download management actions and candidate browser controls', () => {
    const store = makeStore({
      initialProject: makeProject({
        books: {
          'book-1': makeBook({
            documents: [
              {
                id: 'doc-1',
                provider: 'qbittorrent',
                fileName: 'Test Book.pdf',
                storagePath: '/repo/output/data/documents/Test Book.pdf',
                contentKind: 'pdf',
                contentType: 'application/pdf',
                accessBasis: 'user_owned',
                status: 'stalled',
                matchScore: 0.9,
                availability: {
                  seeders: 0,
                  peers: 0,
                  progress: 0.4,
                  state: 'stalledDL',
                  etaSeconds: null,
                  downloadSpeedBytesPerSecond: 0,
                },
                provenance: {
                  provider: 'qbittorrent',
                  fetchedAt: '2026-01-05T00:00:00.000Z',
                  confidence: 0.8,
                },
                createdAt: '2026-01-05T00:00:00.000Z',
                updatedAt: '2026-01-05T00:00:00.000Z',
              },
            ],
          }),
        },
      }),
    });
    store.commands.selectBook('book-1');
    const view = renderLibraryView(store.selectors.getState(), store);
    const text = view.textContent ?? '';

    expect(text).toContain('Reveal location');
    expect(text).toContain('Remove');
    expect(text).toContain('Also delete downloaded files/content');
    expect(text).toContain('Find ranked results');
    expect(
      view.querySelector(
        'input[placeholder="Paste magnet link or HTTPS .torrent URL"]',
      ),
    ).toBeTruthy();
  });
});
