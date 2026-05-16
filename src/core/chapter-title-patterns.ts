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
export const STRUCTURAL_MARKER_ONLY_PATTERN =
  /^(?:chapter|ch\.?|part|book|volume|vol\.?|unit|section|appendix|lecture|lesson|module|week|session)\s+(?:\d+|[ivxlcdm]+|[a-z]|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/i;
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
export const DOCUMENT_OBJECT_NOISE_PATTERN =
  /^(?:%|startxref\b|(?:\d+\s+){1,2}obj\b|\d{5,}\s+\d{5}\s+[nf]\b|\d+\s+\d+\s+R\b|\d+\/[a-z0-9]+|\[?\/[a-z0-9]+|endobj\b|xref\b|trailer\b|stream\b|endstream\b)|(?:<<|>>|\/(?:DCTDecode|DecodeParms|FontWeight|Length|OutputIntents|ViewerPreferences)\b|[\u00b6\ufffd]|[a-z]:[\\/].+\.(?:eps|pdf|png|jpe?g|tiff?)\b)/i;
export const CONTROL_HEAVY_TEXT_PATTERN = new RegExp(
  String.raw`[\u0000-\u0008\u000b-\u001f\u007f-\u009f]`,
);
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
export const TOC_HEADING_ONLY_PATTERN = /^(?:table of )?contents$/i;
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
    id: 'structural_marker_only',
    role: 'reject',
    pattern: STRUCTURAL_MARKER_ONLY_PATTERN,
    purpose:
      'Reject sourced TOC marker rows unless a following title was joined first.',
    rejects: ['Chapter 1', 'Appendix A'],
  },
  {
    id: 'numbered_title',
    role: 'accept',
    pattern: NUMBERED_TITLE_PATTERN,
    purpose: 'Accept numeric, decimal, and roman numeral TOC entries.',
    accepts: ['3.1 Metric Spaces', 'IV. Integration'],
  },
  {
    id: 'document_object_noise',
    role: 'reject',
    pattern: DOCUMENT_OBJECT_NOISE_PATTERN,
    purpose: 'Reject raw PDF/object-stream fragments before title scoring.',
    rejects: [
      '1 0 obj',
      '0000000015 00000 n',
      '9036 0 R/Lang(en-US)',
      '/Width 1041',
      'stream',
    ],
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
  {
    id: 'toc_heading_only',
    role: 'reject',
    pattern: TOC_HEADING_ONLY_PATTERN,
    purpose: 'Use TOC headings as anchors, not persisted chapter titles.',
    rejects: ['Contents', 'Table of Contents'],
  },
];
