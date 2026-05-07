import type {
  BookDocumentAcquisitionState,
  BookDocumentRef,
} from './book-documents';
import type { BookEnrichment } from './enrichment';

export interface BookRecord {
  id: string;
  title: string;
  short: string;
  authors: string[];
  displayGroup: string;
  manualSeedDifficulty: number;
  pages: number;
  subjects: string[];
  publisher: string;
  isbn: string | null;
  year: number | null;
  sourcePath?: string | null;
  documents?: BookDocumentRef[];
  selectedDocumentId?: string | null;
  documentAcquisition?: BookDocumentAcquisitionState;
  openLibraryKey?: string | null;
  openLibraryEditionKey?: string | null;
  openLibraryWorkKey?: string | null;
  googleBooksId?: string | null;
  manualPrereqs: string[];
  manualCoStudy: string[];
  owned: boolean;
  planOrder: number;
  allowPrereqOverlap: boolean;
  lockDiff: boolean;
  noPropOut: boolean;
  ignored: boolean;
  constantRD: boolean;
  completed: boolean;
  enrichment: BookEnrichment;
}
