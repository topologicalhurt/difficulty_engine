export type ChapterTitleSource = 'structured' | 'unstructured' | 'imported';

const MAX_CHAPTER_TITLE_LENGTH = 140;
const MAX_CHAPTER_WORDS = 18;
const MIN_CHAPTER_TITLE_LENGTH = 2;
const UNSTRUCTURED_SPLIT_PATTERN = /(?:\r?\n|;\s+|\|\s+|(?<=\.)\s+(?=(?:chapter|ch\.?|part|appendix|lecture|lesson|module|unit|\d+[.)])))/i;
const STRUCTURAL_SENTENCE_PATTERN =
  /\b(?:(?:chapter|ch\.?|appendix|lecture|lesson|module|unit|section)\s+[^.;|\n]{2,120}|(?:part|book|volume|vol\.?|week|session)\s+(?:[ivxlcdm]+|\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b[^.;|\n]{0,120}|\d+(?:\.\d+)*[.)]\s+[^.;|\n]{2,120})/giu;
const DOT_LEADER_PAGE_PATTERN = /\s*\.{2,}\s*(?:[ivxlcdm]+|\d{1,4})\s*$/i;
const LEADING_MARKER_PATTERN = /^\s*(?:[-*]|\u2022)\s*/;
const STRUCTURAL_PREFIX_PATTERN =
  /^(?:contents?|chapter|ch\.?|part|book|volume|vol\.?|unit|section|appendix|lecture|lesson|module|week|session)\b/i;
const STRUCTURAL_PREFIX_ONLY_PATTERN =
  /^(?:chapter|ch\.?|part|book|volume|vol\.?|unit|section|appendix|lecture|lesson|module|week|session)$/i;
const FRONT_BACK_MATTER_PATTERN =
  /^(?:preface|foreword|acknowledgements?|contents?|introduction|conclusion|epilogue|prologue|bibliography|references|notes|index|glossary|exercises|problems|solutions|further reading)\b/i;
const NUMBERED_TITLE_PATTERN =
  /^(?:(?:\d+|[ivxlcdm]+)(?:\.\d+)*[.)]?\s+|\d+\s*[:.-]\s+)[\p{L}\p{N}]/iu;
const WORD_NUMBER_TITLE_PATTERN =
  /^(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*[:.-]\s+[\p{L}\p{N}]/iu;
const SENTENCE_BOUNDARY_PATTERN = /[.!?]\s+[\p{Lu}\d]/u;
const URL_OR_ISBN_PATTERN = /\b(?:https?:\/\/|www\.|isbn|copyright|all rights reserved)\b/i;
const LETTER_PATTERN = /\p{L}/u;
const NARRATIVE_START_PATTERN =
  /^(?:this|these|those|it|they|we|you|your|readers?|students?|instructors?|teachers?)\b/i;
const NARRATIVE_VERB_PATTERN =
  /\b(?:book|edition|volume|guide|text|textbook|manual|resource)\b.{0,48}\b(?:provides?|offers?|features?|covers?|describes?|explains?|includes?|contains?|outlines?|presents?|teaches?|helps?|shows?|introduces?)\b/i;
const MARKETING_VERB_PATTERN =
  /\b(?:spark|gain|learn|discover|master|transform your|find out how|step-by-step|hands-on)\b/i;
const DESCRIPTION_WORD_PATTERN = /\b(?:description|overview|summary|synopsis|blurb)\b/i;
const MARKETING_TOC_FRAGMENT_PATTERN =
  /^(?:chapter\s+(?:on|new)\b|new\s+(?:sections?\s+covering|and\s+revised)\b)/i;
const PLAIN_PAGE_SUFFIX_PATTERN = /^(.+?)\s+((?:[ivxlcdm]+)|(?:\d{1,4}))$/i;

function wordsIn(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

function stripPlainPageSuffix(value: string): string {
  const match = value.match(PLAIN_PAGE_SUFFIX_PATTERN);
  if (!match) return value;
  const body = (match[1] ?? '').trim();
  if (STRUCTURAL_PREFIX_ONLY_PATTERN.test(body)) return value;
  if (wordsIn(body).length >= 2 || FRONT_BACK_MATTER_PATTERN.test(body)) return body;
  return value;
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

function isNarrativeText(title: string): boolean {
  if (URL_OR_ISBN_PATTERN.test(title)) return true;
  if (DESCRIPTION_WORD_PATTERN.test(title)) return true;
  if (MARKETING_TOC_FRAGMENT_PATTERN.test(title)) return true;
  if (NARRATIVE_START_PATTERN.test(title)) return true;
  if (NARRATIVE_VERB_PATTERN.test(title)) return true;
  if (MARKETING_VERB_PATTERN.test(title)) return true;
  if (SENTENCE_BOUNDARY_PATTERN.test(title) && wordsIn(title).length > 8) return true;
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
  const title = normalizeChapterTitle(value);
  if (title.length < MIN_CHAPTER_TITLE_LENGTH || title.length > MAX_CHAPTER_TITLE_LENGTH) {
    return false;
  }
  if (!LETTER_PATTERN.test(title)) {
    return false;
  }
  const words = wordsIn(title);
  if (words.length > MAX_CHAPTER_WORDS && !STRUCTURAL_PREFIX_PATTERN.test(title)) {
    return false;
  }
  if (isNarrativeText(title)) {
    return false;
  }
  if (hasStructuralMarker(title)) {
    return true;
  }
  return source !== 'unstructured' && isConcisePlainTitle(title);
}

export function sanitizeChapterTitles(
  values: string[],
  options: { limit?: number; source?: ChapterTitleSource } = {},
): string[] {
  const seen = new Set<string>();
  const chapters: string[] = [];
  const source = options.source ?? 'structured';
  values.forEach((value) => {
    const title = stripPlainPageSuffix(normalizeChapterTitle(value));
    const key = title.toLowerCase();
    if (!isLikelyChapterTitle(title, source) || seen.has(key)) {
      return;
    }
    seen.add(key);
    chapters.push(title);
  });
  return chapters.slice(0, options.limit ?? 80);
}

export function extractChapterCandidatesFromText(
  text: string,
  options: { limit?: number; source?: ChapterTitleSource } = {},
): string[] {
  const input = String(text);
  const parts = input
    .split(UNSTRUCTURED_SPLIT_PATTERN)
    .map((line) => line.trim())
    .filter(Boolean);
  const structuralMatches = Array.from(input.matchAll(STRUCTURAL_SENTENCE_PATTERN))
    .map((match) => match[0])
    .filter(Boolean);
  return sanitizeChapterTitles([...parts, ...structuralMatches], {
    limit: options.limit,
    source: options.source ?? 'unstructured',
  });
}
