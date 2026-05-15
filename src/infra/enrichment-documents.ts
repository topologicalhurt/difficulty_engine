import type {
  BookDocumentRef,
  EnrichmentRequest,
  EnrichmentResponse,
  Logger,
} from '../core/types';
import { qbittorrentRuntimeEnabled } from '../core/source-settings-policy';
import {
  documentRefGreylistKey,
  documentRefIsTrackedQbittorrentReplacement,
  documentRefShouldBeReplaced,
  mergeDocumentCandidateQueue,
  observeDocumentGreylist,
} from '../core/document-acquisition-state';
import {
  chooseSelectedDocumentId,
  defaultDocumentAcquisitionPolicy,
  mergeDocumentRefs,
  rankDocumentCandidates,
} from './document-acquisition';
import type {
  AcquiredDocument,
  DocumentCandidate,
  DocumentAcquisitionPolicy,
  DocumentAcquisitionProvider,
} from './document-acquisition';
import { resolveBookEnrichment } from './toc-strategies';
import { createQBittorrentProvider } from './qbittorrent-provider';
import {
  dedupeAcquiredDocuments,
  loadCompletedDocumentRefs,
} from './completed-document-loader';
import { isoTimestamp } from './cache-time';

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

interface DocumentAcquisitionRun {
  documents: AcquiredDocument[];
  candidates: DocumentCandidate[];
}

function isTerminalAcquiredDocument(document: AcquiredDocument): boolean {
  const ref = document.documentRef;
  if (!ref) {
    return Boolean(document.text || document.bytes || document.pageAnchors?.length);
  }
  if (ref.status === 'failed' || ref.status === 'stalled') return false;
  if (ref.provider === 'qbittorrent') return ref.fileIndex != null;
  return true;
}

function shouldUseQbittorrentProvider(request: EnrichmentRequest): boolean {
  if (request.skipBridgeDocuments) return false;
  return qbittorrentRuntimeEnabled(
    request.sourceSettings,
    request.qbittorrentConnection,
  );
}

function metadataOnlySourceSettings(
  request: EnrichmentRequest,
): EnrichmentRequest['sourceSettings'] {
  if (!request.skipBridgeDocuments) return request.sourceSettings;
  return {
    ...request.sourceSettings,
    documentSources: {
      ...request.sourceSettings.documentSources,
      directUrl: false,
      localFile: false,
      internetArchiveText: false,
      qbittorrent: false,
      localOcr: false,
    },
  };
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
): Promise<DocumentAcquisitionRun> {
  if (!provider?.enabled || !policy.enabled) {
    return { documents: [], candidates: [] };
  }
  try {
    const candidates = await provider.findCandidates({
      book: request.book,
      policy,
      signal: request.signal,
    });
    const deferredDocuments: AcquiredDocument[] = [];
    let latestRejected: AcquiredDocument | null = null;
    for (const candidate of rankDocumentCandidates(
      candidates,
      policy,
      request.book.documentAcquisition,
    )) {
      try {
        const acquired = await provider.acquire(candidate, {
          book: request.book,
          policy,
          signal: request.signal,
        });
        if (acquired) latestRejected = acquired;
        if (acquired && isTerminalAcquiredDocument(acquired)) {
          return { documents: [...deferredDocuments, acquired], candidates };
        }
        if (
          acquired &&
          acquired.documentRef?.status !== 'failed' &&
          acquired.documentRef?.status !== 'stalled'
        ) {
          deferredDocuments.push(acquired);
        }
      } catch (error) {
        logger.warn('enrichment.document_acquisition.candidate_failed', {
          bookId: request.book.id,
          candidateId: candidate.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return {
      documents: deferredDocuments.length
        ? deferredDocuments
        : latestRejected
          ? [latestRejected]
          : [],
      candidates,
    };
  } catch (error) {
    logger.warn('enrichment.document_acquisition.failed', {
      bookId: request.book.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { documents: [], candidates: [] };
  }
}

function mergeResolvedDocumentState(
  request: EnrichmentRequest,
  run: DocumentAcquisitionRun,
): Pick<EnrichmentResponse, 'bookPatch'>['bookPatch'] {
  const documentRefs = run.documents
    .map((document) => document.documentRef)
    .filter((document): document is BookDocumentRef => Boolean(document));
  const replacementKeys = new Set(
    documentRefs
      .filter(documentRefIsTrackedQbittorrentReplacement)
      .map(documentRefGreylistKey),
  );
  const existingDocuments = replacementKeys.size
    ? (request.book.documents ?? []).filter((document) => {
        const existingKey = documentRefGreylistKey(document);
        return !(
          document.provider === 'qbittorrent' &&
          !replacementKeys.has(existingKey) &&
          documentRefShouldBeReplaced(
            document,
            request.book.documentAcquisition,
          )
        );
      })
    : (request.book.documents ?? []);
  const mergedDocuments = documentRefs.length
    ? mergeDocumentRefs(existingDocuments, documentRefs)
    : undefined;
  const candidateState = mergeDocumentCandidateQueue(
    request.book.documentAcquisition,
    run.candidates,
  );
  const documentAcquisition = observeDocumentGreylist(
    candidateState,
    mergedDocuments ?? request.book.documents ?? [],
  );
  const selectedDocumentId =
    mergedDocuments &&
    chooseSelectedDocumentId(
      mergedDocuments,
      request.book.selectedDocumentId,
      request.sourceSettings.contentPreference,
    );
  return {
    ...(mergedDocuments ? { documents: mergedDocuments, selectedDocumentId } : {}),
    documentAcquisition,
  };
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
      const sourceSettings = metadataOnlySourceSettings(request);
      const requestForRun = { ...request, sourceSettings };
      const completedDocuments = request.skipBridgeDocuments
        ? []
        : await loadCompletedDocumentRefs(
            requestForRun,
            options.fetchImpl,
            options.logger,
          );
      const policy = effectiveDocumentPolicy(requestForRun, documentPolicy);
      const acquisitionRun = await acquireCandidateDocuments(
        requestForRun,
        documentProvider(requestForRun, options),
        policy,
        options.logger,
      );
      const usableDocuments = dedupeAcquiredDocuments([
        ...completedDocuments,
        ...acquisitionRun.documents,
      ]);
      const resolution = await resolveBookEnrichment({
        book: request.book,
        signal: request.signal,
        fetchJson: options.jsonFetcher,
        fetchImpl: options.fetchImpl,
        acquiredDocuments: usableDocuments,
        sourceSettings,
        skipBridgeDocuments: request.skipBridgeDocuments,
      });
      return {
        cacheKey,
        bookPatch: {
          ...resolution.bookPatch,
          ...(request.skipBridgeDocuments
            ? {}
            : mergeResolvedDocumentState(requestForRun, {
                documents: usableDocuments,
                candidates: acquisitionRun.candidates,
              })),
        },
        enrichment: resolution.enrichment,
        provenance: resolution.provenance.length
          ? resolution.provenance
          : [
              {
                provider: 'manual',
                sourceUrl: 'local://project',
                fetchedAt: isoTimestamp(),
                confidence: MANUAL_PROVENANCE_CONFIDENCE,
              },
            ],
      };
    },
  };
}
