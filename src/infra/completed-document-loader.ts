import type {
  BookDocumentRef,
  EnrichmentRequest,
  Logger,
} from '../core/types';
import { sourceEnabledForDocumentProvider } from '../core/source-settings-policy';
import type { AcquiredDocument } from './document-acquisition';
import { bridgeDocumentEndpoint } from './document-bridge-url';

const DOCUMENT_TEXT_ENDPOINT = '/documents/read-text';
const DOCUMENT_BYTES_ENDPOINT = '/documents/read-bytes';
const REUSABLE_DOCUMENT_STATUSES = new Set<BookDocumentRef['status']>(['complete', 'unreadable']);
const TEXT_KINDS = new Set<BookDocumentRef['contentKind']>(['text', 'ocr_text']);

function canReuseDocument(document: BookDocumentRef, settings: EnrichmentRequest['sourceSettings']): boolean {
  if (!sourceEnabledForDocumentProvider(document, settings)) return false;
  if (!REUSABLE_DOCUMENT_STATUSES.has(document.status)) return false;
  return TEXT_KINDS.has(document.contentKind) || document.contentKind === 'pdf';
}

async function readBridgeText(
  fetchImpl: typeof fetch,
  baseUrl: string,
  storagePath: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const response = await fetchImpl(bridgeDocumentEndpoint(baseUrl, DOCUMENT_TEXT_ENDPOINT, storagePath), {
    headers: { Accept: 'text/plain' },
    signal,
  });
  if (!response.ok) return undefined;
  const text = await response.text();
  return text.trim() ? text : undefined;
}

async function readBridgeBytes(
  fetchImpl: typeof fetch,
  baseUrl: string,
  storagePath: string,
  signal?: AbortSignal,
): Promise<Uint8Array | undefined> {
  const response = await fetchImpl(bridgeDocumentEndpoint(baseUrl, DOCUMENT_BYTES_ENDPOINT, storagePath), {
    headers: { Accept: 'application/pdf,application/octet-stream' },
    signal,
  });
  return response.ok ? new Uint8Array(await response.arrayBuffer()) : undefined;
}

export async function loadCompletedDocumentRefs(
  request: EnrichmentRequest,
  fetchImpl: typeof fetch,
  logger: Logger,
): Promise<AcquiredDocument[]> {
  const baseUrl = request.qbittorrentConnection?.baseUrl;
  if (!baseUrl || !request.qbittorrentConnection?.enabled) return [];
  const documents = (request.book.documents ?? []).filter((document) =>
    canReuseDocument(document, request.sourceSettings),
  );
  const acquired: AcquiredDocument[] = [];
  for (const document of documents) {
    try {
      const text = TEXT_KINDS.has(document.contentKind) || document.contentKind === 'pdf'
        ? await readBridgeText(fetchImpl, baseUrl, document.storagePath, request.signal).catch(() => undefined)
        : undefined;
      const bytes = !text && document.contentKind === 'pdf'
        ? await readBridgeBytes(fetchImpl, baseUrl, document.storagePath, request.signal).catch(() => undefined)
        : undefined;
      if (!text && !bytes) continue;
      acquired.push({
        candidateId: document.id,
        provider: document.provider,
        sourceUrl: document.sourceUrl,
        storagePath: document.storagePath,
        contentType: document.contentType,
        accessBasis: document.accessBasis,
        confidence: document.provenance.confidence || document.matchScore || 0.6,
        text,
        bytes,
        sha256: document.sha256,
        documentRef: document.status === 'unreadable' && document.contentKind === 'pdf'
          ? { ...document, status: 'complete' }
          : document,
        acquiredAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.warn('enrichment.completed_document.read_failed', {
        bookId: request.book.id,
        documentId: document.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return acquired;
}

export function dedupeAcquiredDocuments(documents: AcquiredDocument[]): AcquiredDocument[] {
  const byKey = new Map<string, AcquiredDocument>();
  documents.forEach((document) => {
    const key = document.documentRef?.id ?? document.storagePath ?? document.sourceUrl ?? document.candidateId;
    const previous = byKey.get(key);
    if (!previous || (!previous.text && document.text) || (!previous.bytes && document.bytes)) {
      byKey.set(key, document);
    }
  });
  return [...byKey.values()];
}
