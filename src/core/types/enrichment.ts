export type EnrichmentStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'stale'
  | 'failed';
export type BookSearchStatus = 'idle' | 'loading' | 'success' | 'failed';

export interface EnrichmentFieldProvenance {
  provider: string;
  sourceUrl?: string;
  fetchedAt: string;
  confidence: number;
  strategy?: string;
  inferred?: boolean;
  evidenceAnchors?: string[];
  rejectedReasons?: string[];
  pageRange?: { start: number; end: number };
  pageRangeTrustStatus?: 'trusted' | 'estimated' | 'missing' | 'conflict';
  trustedChapterPageRangeCount?: number;
}

export interface ChapterPageRange {
  start: number;
  end?: number | null;
}

export interface BookEnrichment {
  chapters: string[];
  chapterPageRanges?: Array<ChapterPageRange | null>;
  topics?: string[];
  topicPageRanges?: Array<ChapterPageRange | null>;
  description: string;
  olSubjects: string[];
  tocSource:
    | 'none'
    | 'manual'
    | 'search'
    | 'openlibrary'
    | 'google_books'
    | 'internet_archive'
    | 'pdf';
  provenance?: Partial<
    Record<
      'chapters' | 'topics' | 'description' | 'subjects',
      EnrichmentFieldProvenance
    >
  >;
}

export interface EnrichmentCacheEntry {
  status: EnrichmentStatus;
  bookId: string;
  cacheKey: string;
  fetchedAt?: string;
  staleAt?: string;
  error?: string;
  data?: BookEnrichment;
  provenance?: EnrichmentFieldProvenance[];
}

export interface BookSearchSuggestion {
  key: string;
  title: string;
  authors: string[];
  subtitle: string;
  isbn: string | null;
  year: number | null;
  publisher: string;
  subjects: string[];
  description: string;
  pages: number | null;
  openLibraryKey?: string | null;
  openLibraryEditionKey?: string | null;
  openLibraryWorkKey?: string | null;
  googleBooksId?: string | null;
}
