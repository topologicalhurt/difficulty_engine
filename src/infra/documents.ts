// Public entry point for the document-acquisition module: the integrated
// qBittorrent + PDF/TOC parsing + document sourcing subsystem.
//
// This barrel is the module's library boundary. Everything outside the module
// (the public API in src/index.ts, the mount in src/main.ts, and the store
// document commands/state in src/app) imports from here rather than reaching
// into individual implementation files. Treat the symbols exported here as the
// module's stable public surface; internals behind them may change freely.
//
// The module has no dependency on the app/store/UI layers — only on a small,
// documented set of shared core types and helpers (the "host contract"). That
// makes it straightforward to extract as a standalone library: lift this
// folder plus the host-contract types and inject fetch/clock/logger/storage.

export {
  candidateHasDownloadEvidence,
  canonicalizeBookDocumentRefs,
  choosePreferredDocumentCandidate,
  chooseSelectedDocumentId,
  defaultDocumentAcquisitionPolicy,
  disabledDocumentAcquisitionProvider,
  isLawfulDocumentCandidate,
  mergeDocumentRefs,
  rankDocumentCandidates,
} from './document-acquisition';

export type {
  AcquiredDocument,
  DocumentAccessBasis,
  DocumentAcquisitionPolicy,
  DocumentAcquisitionProvider,
  DocumentAcquisitionRequest,
  DocumentCandidate,
  DocumentContentKind,
  DocumentStorageAdapter,
} from './document-acquisition';

export {
  createQBittorrentIntegrationService,
  createQBittorrentProvider,
} from './qbittorrent-provider';

export {
  bridgeDocumentEndpoint,
  bridgeEndpoint,
} from './document-bridge-url';

// ── Module domain types ──
// The document / qBittorrent / TOC vocabulary, presented from the module entry
// so callers (and a future standalone extraction) get these shapes from here
// rather than reaching into core/types. The shared document DTO contract lives
// in core/types/{book-documents,source-settings} so the planner host and this
// module agree on identical shapes; on extraction those definitions travel
// with the module and the host maps its own book/settings types onto them.
export type { QBittorrentProviderOptions } from './qbittorrent-client';
export type {
  BookDocumentAvailability,
  BookDocumentBlockedCandidateOption,
  BookDocumentCandidateOption,
  BookDocumentRef,
  BookDocumentSearchAttempt,
  BookDocumentStatus,
  QbittorrentConnectionSettings,
  QbittorrentIntegrationService,
} from '../core/types';

// ── Host contract ──
// To run this module standalone the host must supply:
//   • A book entity (core's BookRecord) — the module reads identity fields
//     only (id, title, short, authors, isbn, sourcePath, subjects) plus the
//     document state it owns on each book (documents, documentAcquisition).
//   • SourceSettings — which metadata/document sources and qBittorrent plugins
//     are enabled; drives the source masks.
//   • A Logger — injected structured logger (carried on
//     DocumentAcquisitionRequest).
//   • Injected runtime: fetch (QBittorrentProviderOptions.fetchImpl), a clock
//     for timestamps, and a DocumentStorageAdapter for persistence.
// The module imports nothing from the host's app/store/UI layers.
//
// ── Module logical boundary ──
// A few document-domain modules intentionally live in core, not infra, because
// the planner's project-load/normalization path shares them with this module
// (core must not import infra, so the shared contract lives in the neutral
// layer). On extraction these travel WITH the module and the planner host
// would depend on the module for them:
//   • core/types/book-documents.ts          (document DTO contract)
//   • core/document-source-safety.ts         (magnet/.torrent source policy)
//   • core/document-candidate-availability.ts (live torrent activity)
//   • core/document-acquisition-state.ts      (greylist / blocked-candidate state)
//   • core/document-candidate-queue.ts        (persisted candidate queue)
// They have no dependency on app/store/UI and form a clean cut line.
