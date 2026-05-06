export type ChapterTitlePatternRole = 'split' | 'accept' | 'reject' | 'cleanup';

export interface ChapterTitlePatternSpec {
  id: string;
  role: ChapterTitlePatternRole;
  pattern: RegExp;
  purpose: string;
  accepts?: string[];
  rejects?: string[];
}

export const UNSTRUCTURED_SPLIT_PATTERN =
  /(?:\r?\n|;\s+|\|\s+|(?<=\.)\s+(?=(?:chapter|ch\.?|part|appendix|lecture|lesson|module|unit|\d+[.)])))/i;
export const STRUCTURAL_SENTENCE_PATTERN =
  /\b(?:(?:chapter|ch\.?|appendix|lecture|lesson|module|unit|section)\s+[^.;|\n]{2,120}|(?:part|book|volume|vol\.?|week|session)\s+(?:[ivxlcdm]+|\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b[^.;|\n]{0,120}|\d+(?:\.\d+)*[.)]\s+[^.;|\n]{2,120})/giu;
export const DOT_LEADER_PAGE_PATTERN =
  /\s*\.{2,}\s*(?:[ivxlcdm]+|\d{1,4})\s*$/i;
export const LEADING_MARKER_PATTERN = /^\s*(?:[-*]|\u2022)\s*/;
export const STRUCTURAL_PREFIX_PATTERN =
  /^(?:contents?|chapter|ch\.?|part|book|volume|vol\.?|unit|section|appendix|lecture|lesson|module|week|session)\b/i;
export const STRUCTURAL_PREFIX_ONLY_PATTERN =
  /^(?:chapter|ch\.?|part|book|volume|vol\.?|unit|section|appendix|lecture|lesson|module|week|session)$/i;
export const FRONT_BACK_MATTER_PATTERN =
  /^(?:preface|foreword|acknowledgements?|contents?|introduction|conclusion|epilogue|prologue|bibliography|references|notes|index|glossary|exercises|problems|solutions|further reading)\b/i;
export const NUMBERED_TITLE_PATTERN =
  /^(?:(?:\d+|[ivxlcdm]+)(?:\.\d+)*[.)]?\s+|\d+\s*[:.-]\s+)[\p{L}\p{N}]/iu;
export const WORD_NUMBER_TITLE_PATTERN =
  /^(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*[:.-]\s+[\p{L}\p{N}]/iu;
export const SENTENCE_BOUNDARY_PATTERN = /[.!?]\s+[\p{Lu}\d]/u;
export const URL_OR_ISBN_PATTERN =
  /\b(?:https?:\/\/|www\.|isbn|copyright|all rights reserved)\b/i;
export const LETTER_PATTERN = /\p{L}/u;
export const NARRATIVE_START_PATTERN =
  /^(?:this|these|those|it|they|we|you|your|readers?|students?|instructors?|teachers?)\b/i;
export const NARRATIVE_VERB_PATTERN =
  /\b(?:book|edition|volume|guide|text|textbook|manual|resource)\b.{0,48}\b(?:provides?|offers?|features?|covers?|describes?|explains?|includes?|contains?|outlines?|presents?|teaches?|helps?|shows?|introduces?)\b/i;
export const MARKETING_VERB_PATTERN =
  /\b(?:spark|gain|learn|discover|master|transform your|find out how|step-by-step|hands-on)\b/i;
export const DESCRIPTION_WORD_PATTERN =
  /\b(?:description|overview|summary|synopsis|blurb)\b/i;
export const MARKETING_TOC_FRAGMENT_PATTERN =
  /^(?:chapter\s+(?:on|new)\b|new\s+(?:sections?\s+covering|and\s+revised)\b)/i;
export const PLAIN_PAGE_SUFFIX_PATTERN =
  /^(.+?)\s+((?:[ivxlcdm]+)|(?:\d{1,4}))$/i;

export const CHAPTER_TITLE_PATTERN_SPECS: ChapterTitlePatternSpec[] = [
  {
    id: 'unstructured_split',
    role: 'split',
    pattern: UNSTRUCTURED_SPLIT_PATTERN,
    purpose: 'Split provider snippets and prose on likely chapter boundaries.',
    accepts: ['Chapter 1 A. Chapter 2 B'],
    rejects: ['This sentence explains a chapter in prose.'],
  },
  {
    id: 'structural_sentence',
    role: 'accept',
    pattern: STRUCTURAL_SENTENCE_PATTERN,
    purpose: 'Find embedded structural chapter-like phrases in snippets.',
    accepts: ['Chapter 1 Signals', 'Appendix A Tables', '3. Filters'],
  },
  {
    id: 'structural_prefix',
    role: 'accept',
    pattern: STRUCTURAL_PREFIX_PATTERN,
    purpose: 'Accept common TOC prefixes only after narrative guards pass.',
    accepts: ['Chapter 1 Signals', 'Lecture 7 Stability'],
  },
  {
    id: 'numbered_title',
    role: 'accept',
    pattern: NUMBERED_TITLE_PATTERN,
    purpose: 'Accept numeric, decimal, and roman numeral TOC entries.',
    accepts: ['3.1 Metric Spaces', 'IV. Integration'],
  },
  {
    id: 'narrative_or_marketing',
    role: 'reject',
    pattern: NARRATIVE_VERB_PATTERN,
    purpose: 'Reject descriptive blurbs that mention book contents.',
    rejects: ['This book provides a chapter on oscillators.'],
  },
  {
    id: 'marketing_toc_fragment',
    role: 'reject',
    pattern: MARKETING_TOC_FRAGMENT_PATTERN,
    purpose: 'Reject common provider-snippet fragments mistaken for chapters.',
    rejects: ['chapter on the latest microcontrollers'],
  },
];
