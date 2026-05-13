import type { ChapterPageRange } from './enrichment';

export type ReadingSectionKind =
  | 'core'
  | 'front_matter'
  | 'toc'
  | 'appendix'
  | 'bibliography_index'
  | 'solutions_reference'
  | 'redundant_duplicate'
  | 'unknown';

export type BookReadingScopeMode =
  | 'project'
  | 'include_all'
  | 'skip_non_core';

export interface BookReadingScope {
  mode: BookReadingScopeMode;
  skippedSectionTitles: string[];
  includedSectionTitles: string[];
}

export interface ReadingScopeSettings {
  defaultMode: Exclude<BookReadingScopeMode, 'project'>;
  skipKinds: ReadingSectionKind[];
}

export interface ReadingSectionDecision {
  index: number;
  title: string;
  kind: ReadingSectionKind;
  skipped: boolean;
  confidence: number;
  reason: string;
  pageRange?: ChapterPageRange | null;
  estimatedPages?: number;
}

export interface EffectiveReadingPages {
  physicalPages: number;
  effectivePages: number;
  skippedPages: number;
  skippedSections: ReadingSectionDecision[];
  confidence: number;
  bindingReason: string | null;
}
