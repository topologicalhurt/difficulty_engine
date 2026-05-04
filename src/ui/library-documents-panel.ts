import type { AppState, BookDocumentRef, BookRecord, PlannerStore } from '../core/types';
import { badge, button, card, el, emptyState } from './dom';
import { formatOneDecimal, formatPercent } from './format';

function statusTone(status: BookDocumentRef['status']): 'neutral' | 'success' | 'warn' | 'danger' {
  if (status === 'complete') return 'success';
  if (status === 'failed' || status === 'unreadable') return 'danger';
  if (status === 'stalled') return 'warn';
  return 'neutral';
}

function displayDocumentStatus(document: BookDocumentRef): BookDocumentRef['status'] {
  return document.status === 'unreadable' && document.contentKind === 'pdf'
    ? 'complete'
    : document.status;
}

function documentSummary(document: BookDocumentRef): string {
  const seeders = document.availability.seeders == null ? 'unknown seeders' : `${document.availability.seeders} seeders`;
  const progress = formatPercent(document.availability.progress);
  return `${document.contentKind.toUpperCase()} · ${progress} · ${seeders} · match ${formatOneDecimal(document.matchScore * 10)}/10`;
}

function documentActions(book: BookRecord, document: BookDocumentRef, store: PlannerStore): HTMLElement {
  const status = displayDocumentStatus(document);
  const canRead = status === 'complete' && (document.contentKind === 'text' || document.contentKind === 'ocr_text');
  return el(
    'div',
    { className: 'toolbar-row' },
    button('Open file', {
      className: 'ghost-button',
      onClick: () => void store.commands.openBookDocument(book.id, document.id),
    }),
    button('Read in app', {
      className: 'ghost-button',
      disabled: !canRead,
      onClick: () => void store.commands.readBookDocument(book.id, document.id),
    }),
  );
}

function renderReader(state: AppState, book: BookRecord, store: PlannerStore): HTMLElement | null {
  const reader = state.ui.documentReader;
  if (reader.bookId !== book.id || reader.status === 'idle') return null;
  return card(
    'Document reader',
    el(
      'div',
      { className: 'detail-toolbar' },
      badge(reader.status, reader.status === 'failed' ? 'danger' : reader.status === 'ready' ? 'success' : 'neutral'),
      el('strong', { text: reader.title }),
      el('div', { className: 'detail-spacer' }),
      button('Close', {
        className: 'ghost-button',
        onClick: () => store.commands.closeBookDocumentReader(),
      }),
    ),
    reader.error ? el('div', { className: 'muted-copy', text: reader.error }) : null,
    reader.text
      ? el('pre', { className: 'document-reader-text', text: reader.text.slice(0, 120_000) })
      : el('div', { className: 'muted-copy', text: reader.status === 'loading' ? 'Loading document text...' : 'No readable text available.' }),
  );
}

export function renderBookDocumentsPanel(
  state: AppState,
  book: BookRecord,
  store: PlannerStore,
): HTMLElement {
  const documents = book.documents ?? [];
  return card(
    'Offline documents',
    documents.length
      ? el(
          'div',
          { className: 'stack-list' },
          ...documents.map((document) =>
            {
              const status = displayDocumentStatus(document);
              return el(
                'div',
                { className: 'document-card' },
                el(
                  'div',
                  { className: 'detail-toolbar' },
                  badge(status, statusTone(status)),
                  badge(document.contentKind),
                  el('strong', { text: document.fileName }),
                ),
                el('div', { className: 'muted-copy', text: documentSummary(document) }),
                el('div', { className: 'muted-copy', text: document.storagePath }),
                document.availability.reason
                  ? el('div', { className: 'muted-copy', text: document.availability.reason })
                  : null,
                documentActions(book, document, store),
              );
            },
          ),
        )
      : emptyState(
          'No offline documents yet',
          'Refresh enrichment with qBittorrent enabled to start background document acquisition.',
        ),
    renderReader(state, book, store),
  );
}
