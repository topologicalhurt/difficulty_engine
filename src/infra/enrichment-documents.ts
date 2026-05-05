import type {
  BookDocumentRef,
  EnrichmentRequest,
  EnrichmentResponse,
  Logger,
} from '../core/types';
import { qbittorrentRuntimeEnabled } from '../core/source-settings-policy';
import {
  choosePreferredDocumentCandidate,
  defaultDocumentAcquisitionPolicy,
  mergeDocumentRefs,
} from './document-acquisition';
import type {
  AcquiredDocument,
  DocumentAcquisitionPolicy,
  DocumentAcquisitionProvider,
} from './document-acquisition';
import { resolveBookEnrichment } from './toc-strategies';
import { createQBittorrentProvider } from './qbittorrent-provider';
import {
  dedupeAcquiredDocuments,
  loadCompletedDocumentRefs,
} from './completed-document-loader';

type JsonFetcher = <T>(url: string, signal?: AbortSignal) => Promise<T>;

const MANUAL_PROVENANCE_CONFIDENCE = 0.25;

interface BookEnrichmentLoaderOptions {
  fetchImpl: typeof fetch;
  jsonFetcher: JsonFetcher;
  logger: Logger;
  documentAcquisitionProvider?: DocumentAcquisitionProvider;
  documentAcquisitionPolicy?: DocumentAcquisitionPolicy;
}

interface BookEnrichmentLoader {
  loadBook(
    request: EnrichmentRequest,
    cacheKey: string,
  ): Promise<EnrichmentResponse>;
}

function shouldUseQbittorrentProvider(request: EnrichmentRequest): boolean {
  return qbittorrentRuntimeEnabled(
    request.sourceSettings,
    request.qbittorrentConnection,
  );
}

function effectiveDocumentPolicy(
  request: EnrichmentRequest,
  policy: DocumentAcquisitionPolicy,
): DocumentAcquisitionPolicy {
  return {
    ...policy,
    enabled: policy.enabled || shouldUseQbittorrentProvider(request),
    dataRoot: request.qbittorrentConnection?.savePath || policy.dataRoot,
    contentPreference: request.sourceSettings.contentPreference,
    sourceSettings: request.sourceSettings,
  };
}

function documentProvider(
  request: EnrichmentRequest,
  options: BookEnrichmentLoaderOptions,
): DocumentAcquisitionProvider | undefined {
  if (options.documentAcquisitionProvider) {
    return options.documentAcquisitionProvider;
  }
  if (
    !shouldUseQbittorrentProvider(request) ||
    !request.qbittorrentConnection
  ) {
    return undefined;
  }
  return createQBittorrentProvider({
    baseUrl: request.qbittorrentConnection.baseUrl,
    username: request.qbittorrentConnection.username,
    password: request.qbittorrentConnection.password,
    savePath: request.qbittorrentConnection.savePath,
    category: request.qbittorrentConnection.category,
    timeoutMs: request.qbittorrentConnection.timeoutMs,
    fetchImpl: options.fetchImpl,
  });
}

async function acquireCandidateDocuments(
  request: EnrichmentRequest,
  provider: DocumentAcquisitionProvider | undefined,
  policy: DocumentAcquisitionPolicy,
  logger: Logger,
): Promise<AcquiredDocument[]> {
  if (!provider?.enabled || !policy.enabled) {
    return [];
  }
  try {
    const candidates = await provider.findCandidates({
      book: request.book,
      policy,
      signal: request.signal,
    });
    const candidate = choosePreferredDocumentCandidate(candidates, policy);
    if (!candidate) {
      return [];
    }
    const acquired = await provider.acquire(candidate, {
      book: request.book,
      policy,
      signal: request.signal,
    });
    return acquired ? [acquired] : [];
  } catch (error) {
    logger.warn('enrichment.document_acquisition.failed', {
      bookId: request.book.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

function mergeResolvedDocumentRefs(
  request: EnrichmentRequest,
  documents: AcquiredDocument[],
): Pick<EnrichmentResponse, 'bookPatch'>['bookPatch'] {
  const documentRefs = documents
    .map((document) => document.documentRef)
    .filter((document): document is BookDocumentRef => Boolean(document));
  const mergedDocuments = documentRefs.length
    ? mergeDocumentRefs(request.book.documents ?? [], documentRefs)
    : undefined;
  const existingSelection =
    request.book.selectedDocumentId &&
    mergedDocuments?.some(
      (document) => document.id === request.book.selectedDocumentId,
    )
      ? request.book.selectedDocumentId
      : null;
  const selectedDocumentId =
    existingSelection ??
    mergedDocuments?.find((document) => document.status === 'complete')?.id ??
    mergedDocuments?.[0]?.id;
  return mergedDocuments
    ? { documents: mergedDocuments, selectedDocumentId }
    : {};
}

export function createBookEnrichmentLoader(
  options: BookEnrichmentLoaderOptions,
): BookEnrichmentLoader {
  const documentPolicy =
    options.documentAcquisitionPolicy ?? defaultDocumentAcquisitionPolicy();

  return {
    async loadBook(
      request: EnrichmentRequest,
      cacheKey: string,
    ): Promise<EnrichmentResponse> {
      const completedDocuments = await loadCompletedDocumentRefs(
        request,
        options.fetchImpl,
        options.logger,
      );
      const policy = effectiveDocumentPolicy(request, documentPolicy);
      const acquiredDocuments = await acquireCandidateDocuments(
        request,
        documentProvider(request, options),
        policy,
        options.logger,
      );
      const usableDocuments = dedupeAcquiredDocuments([
        ...completedDocuments,
        ...acquiredDocuments,
      ]);
      const resolution = await resolveBookEnrichment({
        book: request.book,
        signal: request.signal,
        fetchJson: options.jsonFetcher,
        fetchImpl: options.fetchImpl,
        acquiredDocuments: usableDocuments,
        sourceSettings: request.sourceSettings,
      });
      return {
        cacheKey,
        bookPatch: {
          ...resolution.bookPatch,
          ...mergeResolvedDocumentRefs(request, usableDocuments),
        },
        enrichment: resolution.enrichment,
        provenance: resolution.provenance.length
          ? resolution.provenance
          : [
              {
                provider: 'manual',
                sourceUrl: 'local://project',
                fetchedAt: new Date().toISOString(),
                confidence: MANUAL_PROVENANCE_CONFIDENCE,
              },
            ],
      };
    },
  };
}
