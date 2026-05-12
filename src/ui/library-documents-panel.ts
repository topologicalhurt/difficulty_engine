import type {
  AppState,
  BookDocumentBlockedCandidateOption,
  BookDocumentCandidateOption,
  BookDocumentSearchAttempt,
  BookDocumentRef,
  BookRecord,
  PlannerStore,
} from '../core/types';
import { badge, button, card, el, emptyState } from './dom';
import { checkboxControl, textInputControl } from './form-controls';
import { formatOneDecimal, formatPercent } from './format';
import { runConfirmableAction } from './confirmable-action';
import {
  getPendingBooleanOption,
  setPendingBooleanOption,
} from './pending-action-options';

function statusTone(
  status: BookDocumentRef['status'],
): 'neutral' | 'success' | 'warn' | 'danger' {
  if (status === 'complete') return 'success';
  if (status === 'failed' || status === 'unreadable') return 'danger';
  if (status === 'stalled') return 'warn';
  return 'neutral';
}

function displayDocumentStatus(
  document: BookDocumentRef,
): BookDocumentRef['status'] {
  return document.status === 'unreadable' && document.contentKind === 'pdf'
    ? 'complete'
    : document.status;
}

function documentSummary(document: BookDocumentRef): string {
  const seeders =
    document.availability.seeders == null
      ? 'unknown seeders'
      : `${document.availability.seeders} seeders`;
  const progress = formatPercent(document.availability.progress);
  const eta =
    document.availability.etaSeconds == null
      ? ''
      : ` · ETA ${formatDuration(document.availability.etaSeconds)}`;
  const speed =
    document.availability.downloadSpeedBytesPerSecond == null
      ? ''
      : ` · ${formatBytes(document.availability.downloadSpeedBytesPerSecond)}/s`;
  return `${document.contentKind.toUpperCase()} · ${progress} · ${seeders}${eta}${speed} · match ${formatOneDecimal(document.matchScore * 10)}/10`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024)
    return `${formatOneDecimal(bytes / 1024 / 1024)} MB`;
  if (bytes >= 1024) return `${formatOneDecimal(bytes / 1024)} KB`;
  return `${Math.round(bytes)} B`;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return 'unknown';
  if (seconds < 90) return `${Math.round(seconds)}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes}m`;
  return `${formatOneDecimal(minutes / 60)}h`;
}

function documentActions(
  book: BookRecord,
  document: BookDocumentRef,
  store: PlannerStore,
): HTMLElement {
  const status = displayDocumentStatus(document);
  const canRead =
    status === 'complete' &&
    document.provider !== 'qbittorrent' &&
    (document.contentKind === 'text' || document.contentKind === 'ocr_text');
  let deleteContent = false;
  return el(
    'div',
    { className: 'stack-list compact-stack' },
    el(
      'label',
      { className: 'inline-control muted-copy' },
      checkboxControl({
        checked: false,
        onChange: (checked) => {
          deleteContent = checked;
        },
      }),
      el('span', { text: 'Also delete downloaded files/content' }),
    ),
    el(
      'div',
      { className: 'toolbar-row' },
      button('Open file', {
        className: 'ghost-button',
        onClick: () =>
          void store.commands.openBookDocument(book.id, document.id),
      }),
      button('Reveal location', {
        className: 'ghost-button',
        onClick: () =>
          void store.commands.revealBookDocument(book.id, document.id),
      }),
      button('Read in app', {
        className: 'ghost-button',
        disabled: !canRead,
        onClick: () =>
          void store.commands.readBookDocument(book.id, document.id),
      }),
      button('Remove', {
        className: 'ghost-button danger-button',
        onClick: () =>
          void store.commands.removeBookDocument(book.id, document.id, {
            deleteContent,
          }),
      }),
    ),
  );
}

function renderCandidateBrowser(
  state: AppState,
  book: BookRecord,
  store: PlannerStore,
): HTMLElement {
  const browser = state.ui.documentCandidates;
  const activeForBook = browser.bookId === book.id;
  const manualValue = browser.manualSource;
  const persistedQueue = book.documentAcquisition?.candidateQueue ?? [];
  const blockedCandidates = book.documentAcquisition?.blockedCandidates ?? [];
  const searchAttempts = book.documentAcquisition?.searchAttempts ?? [];
  const candidates = activeForBook
    ? browser.candidates.length
      ? browser.candidates
      : persistedQueue
    : persistedQueue;
  return card(
    'Find a better document',
    el(
      'div',
      { className: 'toolbar-row' },
      button(
        activeForBook && browser.status === 'loading'
          ? 'Searching...'
          : 'Find ranked results',
        {
          className: 'ghost-button',
          disabled: activeForBook && browser.status === 'loading',
          onClick: () =>
            void store.commands.refreshBookDocumentCandidates(book.id),
        },
      ),
      textInputControl({
        value: manualValue,
        focusKey: `document-manual-source:${book.id}`,
        placeholder: 'Paste magnet link or HTTPS .torrent URL',
        onInput: (value) => store.commands.setBookDocumentManualSource(value),
      }),
      button('Use manual source', {
        className: 'ghost-button',
        onClick: () =>
          void store.commands.addBookTorrentSource(book.id, manualValue),
      }),
    ),
    activeForBook && browser.error
      ? el('div', { className: 'muted-copy danger-copy', text: browser.error })
      : null,
    searchAttempts.length ? renderSearchTrace(searchAttempts) : null,
    candidates.length
      ? el(
          'div',
          { className: 'stack-list' },
          ...candidates
            .slice(0, 10)
            .map((candidate) =>
              renderCandidateQueueItem(book, candidate, browser.status, store),
            ),
        )
      : activeForBook && browser.status === 'ready'
        ? emptyState(
            'No trusted qBittorrent results',
            'Try a more precise manual magnet or HTTPS .torrent source with matching author or ISBN evidence.',
          )
        : null,
    blockedCandidates.length
      ? renderBlockedCandidates(book, blockedCandidates, store)
      : null,
  );
}

function renderSearchTrace(attempts: BookDocumentSearchAttempt[]): HTMLElement {
  return el(
    'details',
    { className: 'document-card compact-stack' },
    el('summary', {
      text: `Search trace (${attempts.length} recent attempt${attempts.length === 1 ? '' : 's'})`,
    }),
    el(
      'div',
      { className: 'stack-list compact-stack' },
      ...attempts.slice(0, 8).map((attempt) =>
        el(
          'div',
          { className: 'muted-copy' },
          el('strong', { text: attempt.intent.replace(/_/g, ' ') }),
          el('span', {
            text: `: "${attempt.pattern}" via ${attempt.plugins || 'enabled plugins'} · ${attempt.resultCount} raw · ${attempt.acceptedCount} accepted · ${attempt.blockedCount} blocked · ${formatOneDecimal(attempt.pollDurationMs / 1000)}s${attempt.error ? ` · ${attempt.error}` : ''}`,
          }),
        ),
      ),
    ),
  );
}

function renderBlockedCandidates(
  book: BookRecord,
  candidates: BookDocumentBlockedCandidateOption[],
  store: PlannerStore,
): HTMLElement {
  return el(
    'details',
    { className: 'document-card compact-stack' },
    el('summary', {
      text: `Raw matches found but blocked (${candidates.length})`,
    }),
    el(
      'div',
      { className: 'stack-list compact-stack' },
      ...candidates.slice(0, 10).map((candidate) =>
        el(
          'div',
          { className: 'document-card' },
          el(
            'div',
            { className: 'detail-toolbar' },
            badge(candidate.contentKind),
            candidate.retryableAsUserOwned
              ? badge('manual confirmable', 'warn')
              : null,
            el('strong', { text: candidate.title }),
          ),
          el('div', {
            className: 'muted-copy',
            text: [
              candidate.seeders == null
                ? 'unknown seeders'
                : `${candidate.seeders} seeders`,
              candidate.matchScore == null
                ? null
                : `match ${formatOneDecimal(candidate.matchScore * 10)}/10`,
              candidate.pattern ? `query "${candidate.pattern}"` : null,
              `blocked: ${candidate.blockedReasons.join(', ')}`,
            ]
              .filter(Boolean)
              .join(' · '),
          }),
          el('div', { className: 'muted-copy', text: candidate.sourceUrl }),
          candidate.retryableAsUserOwned
            ? button('Use as user-owned source', {
                className: 'ghost-button',
                onClick: () =>
                  void store.commands.addBookTorrentSource(
                    book.id,
                    candidate.sourceUrl,
                  ),
              })
            : null,
        ),
      ),
    ),
  );
}

function renderCandidateQueueItem(
  book: BookRecord,
  candidate: BookDocumentCandidateOption,
  status: AppState['ui']['documentCandidates']['status'],
  store: PlannerStore,
): HTMLElement {
  return el(
    'div',
    { className: 'document-card' },
    el(
      'div',
      { className: 'detail-toolbar' },
      candidate.rank ? badge(`#${candidate.rank}`) : null,
      badge(candidate.contentKind),
      candidate.accessBasis ? badge(candidate.accessBasis) : null,
      candidate.greylistPenalty
        ? badge(
            `greylist -${formatOneDecimal(candidate.greylistPenalty * 10)}`,
            'warn',
          )
        : null,
      el('strong', { text: candidate.title }),
    ),
    el('div', {
      className: 'muted-copy',
      text: [
        candidate.seeders == null
          ? 'unknown seeders'
          : `${candidate.seeders} seeders`,
        candidate.peers == null ? null : `${candidate.peers} peers`,
        candidate.availability?.etaSeconds == null
          ? null
          : `ETA ${formatDuration(candidate.availability.etaSeconds)}`,
        candidate.availability?.downloadSpeedBytesPerSecond == null
          ? null
          : `${formatBytes(candidate.availability.downloadSpeedBytesPerSecond)}/s`,
        `match ${formatOneDecimal((candidate.matchScore ?? 0) * 10)}/10`,
        candidate.qualityScore == null
          ? null
          : `quality ${formatOneDecimal(candidate.qualityScore * 10)}/10`,
      ]
        .filter(Boolean)
        .join(' · '),
    }),
    candidate.greylistReason
      ? el('div', {
          className: 'muted-copy',
          text: candidate.greylistReason,
        })
      : null,
    candidate.qualityReason
      ? el('div', {
          className: 'muted-copy',
          text: candidate.qualityReason,
        })
      : null,
    el('div', { className: 'muted-copy', text: candidate.sourceUrl }),
    button('Use this result', {
      className: 'ghost-button',
      disabled: status === 'acquiring',
      onClick: () =>
        void store.commands.selectBookDocumentCandidate(book.id, candidate.id),
    }),
  );
}

function renderMetadataCleanup(
  book: BookRecord,
  store: PlannerStore,
): HTMLElement {
  const optionKey = `metadata.clearBook.deleteContent:${book.id}`;
  return card(
    'Metadata cleanup',
    el('p', {
      className: 'muted-copy',
      text: 'Clears enrichment, TOC, provider IDs, qBittorrent candidates, greylist entries, and document refs for this book. Progress and manual planning choices are preserved.',
    }),
    el(
      'label',
      { className: 'inline-control muted-copy' },
      checkboxControl({
        checked: getPendingBooleanOption(store, optionKey),
        onChange: (checked) => {
          setPendingBooleanOption(store, optionKey, checked);
        },
      }),
      el('span', { text: 'Also delete downloaded PDFs/content' }),
    ),
    button('Delete metadata', {
      className: 'ghost-button danger-button',
      onClick: () =>
        runConfirmableAction(store, {
          id: `metadata.clearBook:${book.id}`,
          message:
            'Click Delete metadata again to confirm clearing this book’s enrichment/document metadata.',
          action: () =>
            void store.commands.clearBookMetadata(book.id, {
              deleteContent: getPendingBooleanOption(store, optionKey),
            }),
        }),
    }),
  );
}

function renderReader(
  state: AppState,
  book: BookRecord,
  store: PlannerStore,
): HTMLElement | null {
  const reader = state.ui.documentReader;
  if (reader.bookId !== book.id || reader.status === 'idle') return null;
  return card(
    'Document reader',
    el(
      'div',
      { className: 'detail-toolbar' },
      badge(
        reader.status,
        reader.status === 'failed'
          ? 'danger'
          : reader.status === 'ready'
            ? 'success'
            : 'neutral',
      ),
      el('strong', { text: reader.title }),
      el('div', { className: 'detail-spacer' }),
      button('Close', {
        className: 'ghost-button',
        onClick: () => store.commands.closeBookDocumentReader(),
      }),
    ),
    reader.error
      ? el('div', { className: 'muted-copy', text: reader.error })
      : null,
    reader.text
      ? el('pre', {
          className: 'document-reader-text',
          text: reader.text.slice(0, 120_000),
        })
      : el('div', {
          className: 'muted-copy',
          text:
            reader.status === 'loading'
              ? 'Loading document text...'
              : 'No readable text available.',
        }),
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
          ...documents.map((document) => {
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
              el('div', {
                className: 'muted-copy',
                text: documentSummary(document),
              }),
              el('div', {
                className: 'muted-copy',
                text: document.storagePath,
              }),
              document.availability.reason
                ? el('div', {
                    className: 'muted-copy',
                    text: document.availability.reason,
                  })
                : null,
              documentActions(book, document, store),
            );
          }),
        )
      : emptyState(
          'No offline documents yet',
          'Refresh enrichment with qBittorrent enabled to start background document acquisition.',
        ),
    renderReader(state, book, store),
    renderCandidateBrowser(state, book, store),
    renderMetadataCleanup(book, store),
  );
}
