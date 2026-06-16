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
