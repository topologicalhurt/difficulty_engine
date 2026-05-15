import type { BookRecord, SourceSettings } from '../core/types';
import type { AcquiredDocument } from './document-acquisition';

export type JsonFetcher = <T>(url: string, signal?: AbortSignal) => Promise<T>;

export interface StrategyContext {
  book: BookRecord;
  fetchJson: JsonFetcher;
  fetchImpl?: typeof fetch;
  acquiredDocuments?: AcquiredDocument[];
  sourceSettings?: SourceSettings;
  skipBridgeDocuments?: boolean;
  allowInternetArchiveTextFetch?: boolean;
  signal?: AbortSignal;
}
