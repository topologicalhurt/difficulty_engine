import type { BookEnrichment, BookRecord, EnrichmentFieldProvenance } from '../core/types';
import { extractDocumentChapters } from './document-text-extractor';
import {
  archiveRelevance,
  archiveSearchUrls,
  creatorConflictsForGenericTitle,
  type ArchiveSearchDoc,
} from './internet-archive-matching';

const ARCHIVE_RESULT_LIMIT = 5;
const ARCHIVE_TEXT_FILE_LIMIT = 2;
const ARCHIVE_MAX_TEXT_BYTES = 6_000_000;
const ARCHIVE_TEXT_SCAN_CHARS = 140_000;
const ARCHIVE_TEXT_RANGE_BYTES = 420_000;
const ARCHIVE_TEXT_TIMEOUT_MS = 8_000;
const ARCHIVE_MIN_RELEVANCE = 0.34;

type JsonFetcher = <T>(url: string, signal?: AbortSignal) => Promise<T>;

interface ArchiveSearchResponse {
  response?: {
    docs?: ArchiveSearchDoc[];
  };
}

interface ArchiveFile {
  name?: string;
  format?: string;
  size?: string;
}

interface ArchiveMetadataResponse {
  metadata?: {
    title?: string;
    description?: string;
    subject?: string | string[];
  };
  files?: ArchiveFile[];
}

export interface InternetArchiveCandidate {
  provider: EnrichmentFieldProvenance['provider'];
  sourceUrl: string;
  confidence: number;
  chapters?: string[];
  description?: string;
  subjects?: string[];
  tocSource?: BookEnrichment['tocSource'];
  strategy?: string;
  inferred?: boolean;
  evidenceAnchors?: string[];
}

function archiveDownloadUrl(identifier: string, fileName: string): string {
  return `https://archive.org/download/${encodeURIComponent(identifier)}/${encodeURIComponent(fileName)}`;
}

function normalizeSubjects(value: string | string[] | undefined): string[] {
  const subjects = Array.isArray(value) ? value : String(value ?? '').split(';');
  return subjects.map((entry) => entry.trim()).filter(Boolean).slice(0, 20);
}

function numericSize(file: ArchiveFile): number {
  return Number.parseInt(String(file.size ?? '0'), 10) || 0;
}

function textFiles(files: ArchiveFile[]): ArchiveFile[] {
  return files
    .filter((file) => {
      const name = String(file.name ?? '');
      const size = numericSize(file);
      return /_djvu\.txt$/i.test(name) && size > 0 && size <= ARCHIVE_MAX_TEXT_BYTES;
    })
    .sort((left, right) => numericSize(left) - numericSize(right))
    .slice(0, ARCHIVE_TEXT_FILE_LIMIT);
}

async function fetchText(
  fetchImpl: typeof fetch,
  url: string,
  signal?: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(
    () => controller.abort(new Error('Internet Archive text fetch timed out')),
    ARCHIVE_TEXT_TIMEOUT_MS,
  );
  const onAbort = (): void => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        Accept: 'text/plain,*/*;q=0.5',
        Range: `bytes=0-${ARCHIVE_TEXT_RANGE_BYTES - 1}`,
      },
    });
    if (!response.ok) return '';
    return (await response.text()).slice(0, ARCHIVE_TEXT_SCAN_CHARS);
  } catch {
    return '';
  } finally {
    signal?.removeEventListener('abort', onAbort);
    globalThis.clearTimeout(timeout);
  }
}

function extractArchiveChapters(text: string): string[] {
  return extractDocumentChapters({ text, contentType: 'text/plain' })?.chapters ?? [];
}

async function archiveCandidateFromDoc(
  doc: ArchiveSearchDoc,
  fetchJson: JsonFetcher,
  fetchImpl: typeof fetch,
  signal?: AbortSignal,
): Promise<InternetArchiveCandidate | null> {
  const identifier = String(doc.identifier ?? '').trim();
  if (!identifier) return null;
  const metadata = await fetchJson<ArchiveMetadataResponse>(
    `https://archive.org/metadata/${encodeURIComponent(identifier)}`,
    signal,
  ).catch(() => null);
  if (!metadata) return null;
  const files = textFiles(metadata.files ?? []);
  const chaptersByFile = await Promise.all(
    files.map(async (file) => {
      const name = String(file.name ?? '');
      const text = await fetchText(fetchImpl, archiveDownloadUrl(identifier, name), signal);
      const extraction = extractDocumentChapters({ text, contentType: 'text/plain' });
      return {
        chapters: extraction?.chapters ?? extractArchiveChapters(text),
        strategy: extraction?.strategy,
        inferred: extraction?.inferred,
        evidenceAnchors: extraction?.evidenceAnchors,
      };
    }),
  );
  const selected = chaptersByFile.find((items) => items.chapters.length >= 3) ?? chaptersByFile[0];
  const chapters = selected?.chapters ?? [];
  if (!chapters.length && !metadata.metadata?.description && !metadata.metadata?.subject) {
    return null;
  }
  return {
    provider: 'internet_archive',
    sourceUrl: `https://archive.org/details/${identifier}`,
    confidence: chapters.length ? 0.78 : 0.46,
    chapters,
    description: String(metadata.metadata?.description ?? '').trim(),
    subjects: normalizeSubjects(metadata.metadata?.subject),
    tocSource: chapters.length ? 'internet_archive' : 'none',
    strategy: selected?.strategy,
    inferred: selected?.inferred,
    evidenceAnchors: selected?.evidenceAnchors,
  };
}

export async function fetchInternetArchiveCandidates(
  options: {
    book: BookRecord;
    fetchJson: JsonFetcher;
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
  },
): Promise<InternetArchiveCandidate[]> {
  if (!options.fetchImpl) return [];
  const docs = (
    await Promise.all(
      archiveSearchUrls(options.book).map((url) =>
        options.fetchJson<ArchiveSearchResponse>(url, options.signal)
          .then((payload) => payload.response?.docs ?? [])
          .catch(() => []),
      ),
    )
  ).flat();
  const seen = new Set<string>();
  const ranked = docs
    .filter((doc) => {
      const identifier = String(doc.identifier ?? '');
      if (!identifier || seen.has(identifier)) return false;
      seen.add(identifier);
      if (creatorConflictsForGenericTitle(options.book, doc)) return false;
      return archiveRelevance(options.book, doc) >= ARCHIVE_MIN_RELEVANCE;
    })
    .sort((left, right) =>
      archiveRelevance(options.book, right) - archiveRelevance(options.book, left) ||
      String(left.identifier ?? '').localeCompare(String(right.identifier ?? '')),
    )
    .slice(0, ARCHIVE_RESULT_LIMIT);
  return (
    await Promise.all(
      ranked.map((doc) =>
        archiveCandidateFromDoc(doc, options.fetchJson, options.fetchImpl as typeof fetch, options.signal),
      ),
    )
  ).filter(Boolean) as InternetArchiveCandidate[];
}
