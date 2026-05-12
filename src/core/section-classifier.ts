import type {
  BookRecord,
  ReadingSectionDecision,
  ReadingSectionKind,
  ReadingScopeSettings,
} from './types';
import { normalizeText } from './text';
import { clamp, round2 } from './utils';

const FRONT_MATTER_EXACT = new Set([
  'about author',
  'about authors',
  'acknowledgments',
  'acknowledgements',
  'dedication',
  'foreword',
  'preface',
  'prologue',
]);

const BIBLIOGRAPHY_EXACT = new Set([
  'bibliography',
  'glossary',
  'index',
  'notes',
  'notes references',
  'references',
  'selected bibliography',
  'symbol glossary',
]);

function titleKey(title: string): string {
  return normalizeText(title).replace(/\b(chapter|section|part)\b/g, '').trim();
}

export function classifyReadingSection(
  title: string,
  index: number,
  seenKeys: Set<string>,
): { kind: ReadingSectionKind; confidence: number; reason: string } {
  const normalized = normalizeText(title);
  const key = titleKey(title);
  if (!normalized) {
    return {
      kind: 'unknown',
      confidence: 0,
      reason: 'Empty section title cannot be classified.',
    };
  }
  if (seenKeys.has(key)) {
    return {
      kind: 'redundant_duplicate',
      confidence: 0.85,
      reason: 'Repeated normalized section title.',
    };
  }
  seenKeys.add(key);
  if (/^(table of )?contents?$/.test(normalized)) {
    return { kind: 'toc', confidence: 0.95, reason: 'TOC heading.' };
  }
  if (/^appendix\b|^appendices\b|^app\b/.test(normalized)) {
    return {
      kind: 'appendix',
      confidence: 0.9,
      reason: 'Appendix marker.',
    };
  }
  if (BIBLIOGRAPHY_EXACT.has(normalized) || /^(index|bibliography)\b/.test(normalized)) {
    return {
      kind: 'bibliography_index',
      confidence: 0.9,
      reason: 'Back-matter reference section.',
    };
  }
  if (
    /\b(solution manual|solutions?|answers?|reference tables?|notation|errata)\b/.test(
      normalized,
    )
  ) {
    return {
      kind: 'solutions_reference',
      confidence: 0.82,
      reason: 'Solutions/reference material.',
    };
  }
  if (index <= 2 && FRONT_MATTER_EXACT.has(normalized)) {
    return {
      kind: 'front_matter',
      confidence: 0.82,
      reason: 'Front-matter title near the beginning.',
    };
  }
  return {
    kind: 'core',
    confidence: 0.75,
    reason: 'No non-core marker matched.',
  };
}

function scopeMode(book: BookRecord, settings: ReadingScopeSettings): 'include_all' | 'skip_non_core' {
  const mode = book.readingScope?.mode ?? 'project';
  return mode === 'project' ? settings.defaultMode : mode;
}

export function classifyReadingSections(
  book: BookRecord,
  settings: ReadingScopeSettings,
): ReadingSectionDecision[] {
  const mode = scopeMode(book, settings);
  const manualSkipped = new Set(
    (book.readingScope?.skippedSectionTitles ?? []).map(titleKey),
  );
  const manualIncluded = new Set(
    (book.readingScope?.includedSectionTitles ?? []).map(titleKey),
  );
  const skipKinds = new Set(settings.skipKinds);
  const seenKeys = new Set<string>();
  return book.enrichment.chapters.map((title, index) => {
    const classified = classifyReadingSection(title, index, seenKeys);
    const key = titleKey(title);
    const skipped =
      manualIncluded.has(key)
        ? false
        : manualSkipped.has(key) ||
          (mode === 'skip_non_core' && skipKinds.has(classified.kind));
    return {
      index,
      title,
      kind: classified.kind,
      skipped,
      confidence: round2(clamp(classified.confidence, 0, 1)),
      reason: classified.reason,
    };
  });
}
