# Document Acquisition Module (qBittorrent + PDF/TOC)

An integrated, self-contained subsystem that finds, acquires, and parses book
documents — from a local qBittorrent client (via a loopback bridge), from
direct HTTPS URLs, and from already-completed local files — and extracts their
table of contents from PDF outlines, embedded/OCR text, and online provider
fallbacks.

It is designed to be extracted as a standalone library: it has **zero
dependency on the host's app / store / UI layers**, a single public entry
point, injected runtime dependencies, and a small, documented host contract.

- **Public entry point:** [`src/infra/documents.ts`](../src/infra/documents.ts)
  (the barrel). Everything outside the module imports from here, never from
  individual implementation files.
- **Layer:** `src/infra/*` (the implementation) plus a small shared
  document-domain contract in `src/core` (see *Module logical boundary* below).

## Public API

Import everything from the barrel:

```ts
import {
  createQBittorrentProvider,
  createQBittorrentIntegrationService,
  defaultDocumentAcquisitionPolicy,
  choosePreferredDocumentCandidate,
  rankDocumentCandidates,
  isLawfulDocumentCandidate,
  candidateHasDownloadEvidence,
  mergeDocumentRefs,
  canonicalizeBookDocumentRefs,
  chooseSelectedDocumentId,
  disabledDocumentAcquisitionProvider,
  bridgeEndpoint,
  bridgeDocumentEndpoint,
  type DocumentAcquisitionProvider,
  type DocumentAcquisitionRequest,
  type DocumentAcquisitionPolicy,
  type DocumentCandidate,
  type AcquiredDocument,
  type DocumentStorageAdapter,
  type DocumentContentKind,
  type DocumentAccessBasis,
  type QBittorrentProviderOptions,
  type BookDocumentRef,
  type QbittorrentConnectionSettings,
  type QbittorrentIntegrationService,
} from './infra/documents';
```

- **`createQBittorrentProvider(options)`** → a `DocumentAcquisitionProvider`
  (`findCandidates`, `findCandidateSearch`, `acquire`, `listPlugins`,
  `deleteTorrent`). The integrated qBittorrent source.
- **`createQBittorrentIntegrationService(fetchImpl?)`** → connection
  health/test helpers used by host settings UIs.
- **Candidate policy/ranking:** `defaultDocumentAcquisitionPolicy`,
  `rankDocumentCandidates`, `choosePreferredDocumentCandidate`,
  `isLawfulDocumentCandidate`, `candidateHasDownloadEvidence`.
- **Document-ref reconciliation:** `mergeDocumentRefs`,
  `canonicalizeBookDocumentRefs`, `chooseSelectedDocumentId`.

## Injected dependencies

The module performs no ambient I/O; the host injects everything:

- **`fetch`** — `QBittorrentProviderOptions.fetchImpl` (defaults to
  `globalThis.fetch` only as a fallback). All bridge/HTTP calls go through it.
- **`Logger`** — `QBittorrentProviderOptions.logger` (optional). Best-effort
  structured diagnostics for inventory/search failures that otherwise degrade
  silently.
- **`DocumentStorageAdapter`** — persistence for acquired bytes/text.
- **Cancellation** — `DocumentAcquisitionRequest.signal` (optional
  `AbortSignal`) propagates into the bridge document fetches.

Timeouts are internal and do not depend on a caller signal being present (see
*Production guarantees*).

## Host contract

To run standalone, the host supplies:

- A **book entity** (`BookRecord`). The module reads identity fields only —
  `id`, `title`, `short`, `authors`, `isbn`, `sourcePath`, `subjects` — plus the
  document state it owns on each book (`documents`, `documentAcquisition`).
- **`SourceSettings`** — which metadata/document sources and qBittorrent
  plugins are enabled (drives the source masks).
- A **`Logger`** (optional) and an injected `fetch` / clock / storage adapter.

The module imports nothing from app/store/UI.

## Module logical boundary

A few document-domain modules live in `src/core` rather than `src/infra`
because the planner host's project load/normalization path shares them with
this module, and `core` must not import `infra` — so the shared contract
correctly lives in the neutral layer. On extraction these travel **with** the
module and the host depends on the module for them:

- `core/types/book-documents.ts` — the document DTO contract.
- `core/document-source-safety.ts` — magnet / `.torrent` source policy.
- `core/document-candidate-availability.ts` — live torrent activity predicate.
- `core/document-acquisition-state.ts` — greylist / blocked-candidate state.
- `core/document-candidate-queue.ts` — persisted candidate queue.

It also reuses a few generic core helpers (`matchers`, `chapter-titles`,
`utils`, `source-settings-policy`, `time`) that a standalone build would either
vendor or list as peer utilities.

## qBittorrent search & acquisition contract

- **Search is recall-first but policy-gated.** Staged query intents are
  generated from ISBN, cleaned/dehyphenated title, subtitle-free title,
  author/topic surnames, hyphenated titles, distinctive tokens, and broad title
  recall. Jobs are grouped across enabled plugins with a four-running-search
  cap. A flaky plugin/login degrades that secondary source — it never discards
  already-gathered local/manual candidates.
- **Acquisition requires lawful basis + title/author/ISBN trust.**
  Unknown-license, zero-seed (distinct from *unknown* seeders),
  wrong-author, weak-title, plugin-error, solution/manual, non-PDF, and
  unallowed-source rows are persisted as blocked diagnostics under
  `book.documentAcquisition`, never silently converted to planner truth.
- **File selection is PDF-only**, top-level or one folder deep.
- **Live state** (`/torrents/info` + `/torrents/files`) is reconciled through
  `qbittorrent-live-inventory.ts`; providers/UI never re-parse hash/path/
  progress/stall.
- **The bridge URL is loopback-only** (`https` anywhere, or `http` on a
  loopback host). The credential-bearing channel refuses to send to an
  arbitrary plaintext host.

## Staged TOC / PDF evidence pipeline

Chapter evidence is staged document forensics, not a permissive scrape:

1. Manual chapters are authoritative.
2. Completed text / EPUB text / trusted OCR text parsed directly.
3. Completed PDFs inspected locally before network metadata: raw outline
   titles, raw text-like bytes, bridge-backed embedded text, then optional
   local OCR with sidecar confidence.
4. Online/provider snippets are fallback evidence only, behind stricter gates.

Bare `Contents` / `Table of Contents` rows are anchors only — never persisted
as chapters. Page ranges are realigned to the surviving sanitized chapters by
source index so filtering/dedup never shifts a range onto the wrong chapter.

## Production guarantees

- **Every network call is time-bounded.** qBittorrent API (10s), bridge health,
  direct download (30s), and all bridge document/extract/OCR reads (60s) wrap an
  `AbortController` + timeout (linked to the caller's signal) via the shared
  `bridge-fetch.ts` helpers. No call can hang acquisition indefinitely.
- **Every buffered body is size-capped** (8 MB) via `readLimitedResponseBytes`
  (Content-Length pre-check + streaming guard) — no OOM on a large/malicious
  PDF.
- **JSON is parsed defensively.** List/search endpoints validate the top-level
  shape; a non-JSON 200 (proxy/SPA HTML) degrades with a diagnostic snippet, not
  a bare `SyntaxError`.
- **Parsing inputs are bounded** before regex work (decoded-text scan cap,
  110-char line cap, 900-line contents region, 140-char title cap), and every
  TOC/PDF regex is linear (no catastrophic backtracking). Attacker-authored
  torrent/plugin metadata is length-capped before the matcher passes.
- **Graceful degradation is contractual:** a failed optional source/extraction
  returns empty/undefined and logs (when a logger is injected) rather than
  throwing — missing local OCR tooling produces diagnostics, never app failures.

## Extracting as a standalone library

1. Lift `src/infra/*` (the implementation) and the five shared
   `core` document-domain modules listed above + `core/types/book-documents.ts`.
2. Vendor or peer-depend the generic core helpers (`matchers`,
   `chapter-titles`, `utils`, `source-settings-policy`, `time`).
3. Keep `documents.ts` as the package entry (`main`/`exports`).
4. Implement the host contract: provide a `BookRecord`-shaped entity and
   `SourceSettings`, and inject `fetch`, a `Logger`, a clock, and a
   `DocumentStorageAdapter`.

After this audit pass the module has no upward coupling, a single entry, and
documented injected dependencies — the cut line is clean.
