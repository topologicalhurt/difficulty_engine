import {
  documentSourceEnabled,
  metadataSourceEnabled,
} from '../core/source-settings-policy';
import { fetchInternetArchiveCandidates } from './internet-archive';
import {
  acquiredDocumentCandidates,
  sourceDocumentCandidate,
} from './source-document-candidates';
import { googleBooksCandidates } from './toc-google-candidates';
import { existingLocalCandidate } from './toc-local-candidates';
import {
  mergeStrategyCandidates,
  type StrategyCandidate,
  type StrategyResolution,
} from './toc-merge';
import {
  openLibraryEditionCandidate,
  openLibrarySearchCandidates,
  openLibraryWorkCandidate,
} from './toc-openlibrary-candidates';
import type { StrategyContext } from './toc-strategy-context';

export async function resolveBookEnrichment(
  context: StrategyContext,
): Promise<StrategyResolution> {
  const candidates: StrategyCandidate[] = [];
  const local = existingLocalCandidate(context.book);
  if (local) {
    candidates.push(local);
  }
  const sourceCandidate = await sourceDocumentCandidate(context);
  if (sourceCandidate) {
    candidates.push(sourceCandidate);
  }
  candidates.push(...acquiredDocumentCandidates(context));

  const openLibraryEnabled = metadataSourceEnabled(
    context.sourceSettings,
    'openlibrary',
  );
  const googleBooksEnabled = metadataSourceEnabled(
    context.sourceSettings,
    'googleBooks',
  );
  const internetArchiveEnabled =
    metadataSourceEnabled(context.sourceSettings, 'internetArchive') &&
    documentSourceEnabled(context.sourceSettings, 'internetArchiveText');
  const [
    editionCandidate,
    existingWorkCandidate,
    searchCandidates,
    googleCandidates,
    archiveCandidates,
  ] = await Promise.all([
    openLibraryEnabled ? openLibraryEditionCandidate(context) : null,
    openLibraryEnabled ? openLibraryWorkCandidate(context) : null,
    openLibraryEnabled ? openLibrarySearchCandidates(context) : [],
    googleBooksEnabled ? googleBooksCandidates(context) : [],
    internetArchiveEnabled
      ? fetchInternetArchiveCandidates({
          ...context,
          allowTextFetch: context.allowInternetArchiveTextFetch === true,
        })
      : [],
  ]);
  if (editionCandidate) {
    candidates.push(editionCandidate);
    const workCandidate = await openLibraryWorkCandidate(
      context,
      editionCandidate.openLibraryWorkKey ?? null,
    );
    if (workCandidate) {
      candidates.push(workCandidate);
    }
  }
  if (existingWorkCandidate) {
    candidates.push(existingWorkCandidate);
  }
  candidates.push(...searchCandidates);
  candidates.push(...googleCandidates);
  candidates.push(...archiveCandidates);

  return mergeStrategyCandidates(context.book, candidates);
}
