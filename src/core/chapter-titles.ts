import {
  CONTROL_HEAVY_TEXT_PATTERN,
  DESCRIPTION_WORD_PATTERN,
  DOCUMENT_OBJECT_NOISE_PATTERN,
  DOT_LEADER_PAGE_PATTERN,
  FRONT_BACK_MATTER_PATTERN,
  LEADING_MARKER_PATTERN,
  LETTER_PATTERN,
  MARKETING_TOC_FRAGMENT_PATTERN,
  MARKETING_VERB_PATTERN,
  NARRATIVE_START_PATTERN,
  NARRATIVE_VERB_PATTERN,
  NUMBERED_TITLE_PATTERN,
  PLAIN_PAGE_SUFFIX_PATTERN,
  SENTENCE_BOUNDARY_PATTERN,
  STRUCTURAL_MARKER_ONLY_PATTERN,
  STRUCTURAL_PREFIX_ONLY_PATTERN,
  STRUCTURAL_PREFIX_PATTERN,
  STRUCTURAL_SENTENCE_PATTERN,
  TOC_HEADING_ONLY_PATTERN,
  UNSTRUCTURED_SPLIT_PATTERN,
  URL_OR_ISBN_PATTERN,
  WORD_NUMBER_TITLE_PATTERN,
} from './chapter-title-patterns';
import type { MatcherDecision, MatcherSourceMode } from './matchers';
import { matcherDecision } from './matchers';

export type ChapterTitleSource =
  | 'structured'
  | 'unstructured'
  | 'imported'
  | 'provider_snippet'
  | 'manual';

export interface ChapterTitleEntry {
  title: string;
  pageStart?: number;
}

const MAX_CHAPTER_TITLE_LENGTH = 140;
const MAX_CHAPTER_WORDS = 18;
const MIN_CHAPTER_TITLE_LENGTH = 2;

function wordsIn(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

function stripPlainPageSuffix(value: string): string {
  const match = value.match(PLAIN_PAGE_SUFFIX_PATTERN);
  if (!match) return value;
  const body = (match[1] ?? '').trim();
  if (STRUCTURAL_PREFIX_ONLY_PATTERN.test(body)) return value;
  if (wordsIn(body).length >= 2 || FRONT_BACK_MATTER_PATTERN.test(body))
    return body;
  return value;
}

function numericPageSuffix(value: string): number | undefined {
  const dotLeader = value.match(/\.{2,}\s*(\d{1,4})\s*$/);
  if (dotLeader?.[1]) return Number(dotLeader[1]);
  const plain = value.match(PLAIN_PAGE_SUFFIX_PATTERN);
  if (!plain?.[2] || !/^\d+$/.test(plain[2])) return undefined;
  const body = (plain[1] ?? '').trim();
  if (STRUCTURAL_PREFIX_ONLY_PATTERN.test(body)) return undefined;
  if (wordsIn(body).length >= 2 || FRONT_BACK_MATTER_PATTERN.test(body)) {
    return Number(plain[2]);
  }
  return undefined;
}

function normalizeChapterTitle(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(DOT_LEADER_PAGE_PATTERN, '')
    .replace(LEADING_MARKER_PATTERN, '')
    .replace(/\s+/g, ' ')
    .replace(/[.;]\s*$/, '')
    .trim();
}

function hasStructuralMarker(title: string): boolean {
  return (
    STRUCTURAL_PREFIX_PATTERN.test(title) ||
    FRONT_BACK_MATTER_PATTERN.test(title) ||
    NUMBERED_TITLE_PATTERN.test(title) ||
    WORD_NUMBER_TITLE_PATTERN.test(title)
  );
}

function matcherSourceMode(source: ChapterTitleSource): MatcherSourceMode {
  if (source === 'unstructured') return 'provider_snippet';
  if (source === 'provider_snippet') return 'provider_snippet';
  if (source === 'manual') return 'manual';
  if (source === 'imported') return 'metadata';
  return 'structured';
}

function isNarrativeText(title: string): boolean {
  if (TOC_HEADING_ONLY_PATTERN.test(title)) return true;
  if (DOCUMENT_OBJECT_NOISE_PATTERN.test(title)) return true;
  if (CONTROL_HEAVY_TEXT_PATTERN.test(title)) return true;
  if (URL_OR_ISBN_PATTERN.test(title)) return true;
  if (DESCRIPTION_WORD_PATTERN.test(title)) return true;
  if (MARKETING_TOC_FRAGMENT_PATTERN.test(title)) return true;
  if (NARRATIVE_START_PATTERN.test(title)) return true;
  if (NARRATIVE_VERB_PATTERN.test(title)) return true;
  if (MARKETING_VERB_PATTERN.test(title)) return true;
  if (
    SENTENCE_BOUNDARY_PATTERN.test(title) &&
    wordsIn(title).length > 8 &&
    !STRUCTURAL_PREFIX_PATTERN.test(title)
  )
    return true;
  return false;
}

function isConcisePlainTitle(title: string): boolean {
  const words = wordsIn(title);
  if (words.length > 10) return false;
  if (/[.!?]$/.test(title)) return false;
  if (title.includes(':') && words.length > 12) return false;
  return !isNarrativeText(title);
}

export function isLikelyChapterTitle(
  value: string,
  source: ChapterTitleSource = 'structured',
): boolean {
  return chapterTitleDecision(value, source).accepted;
}

export function chapterTitleDecision(
  value: string,
  source: ChapterTitleSource = 'structured',
): MatcherDecision {
  const title = normalizeChapterTitle(value);
  if (
    title.length < MIN_CHAPTER_TITLE_LENGTH ||
    title.length > MAX_CHAPTER_TITLE_LENGTH
  ) {
    return matcherDecision({
      accepted: false,
      score: 0,
      sourceMode: matcherSourceMode(source),
      rejectedReasons: ['invalid_length'],
      evidenceAnchors: [title].filter(Boolean),
    });
  }
  if (!LETTER_PATTERN.test(title)) {
    return matcherDecision({
      accepted: false,
      score: 0,
      sourceMode: matcherSourceMode(source),
      rejectedReasons: ['missing_letters'],
      evidenceAnchors: [title],
    });
  }
  const words = wordsIn(title);
  if (
    words.length > MAX_CHAPTER_WORDS &&
    !STRUCTURAL_PREFIX_PATTERN.test(title)
  ) {
    return matcherDecision({
      accepted: false,
      score: 0.1,
      sourceMode: matcherSourceMode(source),
      rejectedReasons: ['too_many_words'],
      evidenceAnchors: [title],
    });
  }
  if (isNarrativeText(title)) {
    return matcherDecision({
      accepted: false,
      score: 0.1,
      sourceMode: matcherSourceMode(source),
      rejectedReasons: ['narrative_or_marketing_text'],
      evidenceAnchors: [title],
    });
  }
  if (source !== 'manual' && STRUCTURAL_MARKER_ONLY_PATTERN.test(title)) {
    return matcherDecision({
      accepted: false,
      score: 0.15,
      sourceMode: matcherSourceMode(source),
      rejectedReasons: ['marker_only_without_title'],
      evidenceAnchors: [title],
    });
  }
  if (hasStructuralMarker(title)) {
    return matcherDecision({
      accepted: true,
      score: 0.9,
      sourceMode: matcherSourceMode(source),
      reasons: ['structural_marker'],
      evidenceAnchors: [title],
    });
  }
  const plainAllowed =
    !['unstructured', 'provider_snippet'].includes(source) &&
    isConcisePlainTitle(title);
  return matcherDecision({
    accepted: plainAllowed,
    score: plainAllowed ? 0.62 : 0.2,
    sourceMode: matcherSourceMode(source),
    reasons: plainAllowed ? ['concise_plain_title'] : [],
    rejectedReasons: plainAllowed ? [] : ['missing_structural_evidence'],
    evidenceAnchors: [title],
  });
}

export function sanitizeChapterTitles(
  values: string[],
  options: { limit?: number; source?: ChapterTitleSource } = {},
): string[] {
  return sanitizeChapterEntries(values, options).map((entry) => entry.title);
}

export function sanitizeChapterEntries(
  values: string[],
  options: { limit?: number; source?: ChapterTitleSource } = {},
): ChapterTitleEntry[] {
  const seen = new Set<string>();
  const chapters: ChapterTitleEntry[] = [];
  const source = options.source ?? 'structured';
  values.forEach((value) => {
    const title = stripPlainPageSuffix(normalizeChapterTitle(value));
    const key = title.toLowerCase();
    if (!isLikelyChapterTitle(title, source) || seen.has(key)) {
      return;
    }
    seen.add(key);
    chapters.push({ title, pageStart: numericPageSuffix(value) });
  });
  return chapters.slice(0, options.limit ?? 80);
}

export function extractChapterEntriesFromText(
  text: string,
  options: { limit?: number; source?: ChapterTitleSource } = {},
): ChapterTitleEntry[] {
  const input = String(text);
  const parts = input
    .split(UNSTRUCTURED_SPLIT_PATTERN)
    .map((line) => line.trim())
    .filter(Boolean);
  const structuralMatches = Array.from(
    input.matchAll(STRUCTURAL_SENTENCE_PATTERN),
  )
    .map((match) => match[0])
    .filter(Boolean);
  return sanitizeChapterEntries([...parts, ...structuralMatches], {
    limit: options.limit,
    source: options.source ?? 'unstructured',
  });
}

export function extractChapterCandidatesFromText(
  text: string,
  options: { limit?: number; source?: ChapterTitleSource } = {},
): string[] {
  return extractChapterEntriesFromText(text, options).map(
    (entry) => entry.title,
  );
}
