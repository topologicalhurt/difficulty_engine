import { cleanedIsbn } from './isbn';

export type MatcherConfidence = 'high' | 'medium' | 'low' | 'rejected';

export type MatcherSourceMode =
  | 'structured'
  | 'explicit_toc'
  | 'inferred_header'
  | 'provider_snippet'
  | 'manual'
  | 'external_search'
  | 'document_file'
  | 'metadata';

export interface MatcherDecision {
  accepted: boolean;
  score: number;
  confidence: MatcherConfidence;
  reasons: string[];
  rejectedReasons: string[];
  sourceMode: MatcherSourceMode;
  evidenceAnchors: string[];
}

export interface BookMatchTarget {
  title: string;
  short?: string;
  authors?: string[];
  isbn?: string | null;
}

export interface BookMatchCandidate {
  title?: string | null;
  authors?: string[] | null;
  isbn?: string | string[] | null;
  text?: string | null;
}

export const MATCHER_LIMITS = {
  minTokenLength: 3,
  closeTitleScore: 0.65,
  weakBookMatchScore: 0.34,
  authorSupportTitleFloor: 0.35,
  authorScoreWeight: 0.12,
  genericTitleTokenLimit: 3,
  genericTitleAuthorFloor: 0.12,
};

export function matcherDecision(input: {
  accepted: boolean;
  score: number;
  sourceMode: MatcherSourceMode;
  reasons?: string[];
  rejectedReasons?: string[];
  evidenceAnchors?: string[];
}): MatcherDecision {
  const score = Math.max(0, Math.min(1, input.score));
  const confidence: MatcherConfidence = !input.accepted
    ? 'rejected'
    : score >= 0.8
      ? 'high'
      : score >= 0.55
        ? 'medium'
        : 'low';
  return {
    accepted: input.accepted,
    score,
    confidence,
    reasons: input.reasons ?? [],
    rejectedReasons: input.rejectedReasons ?? [],
    sourceMode: input.sourceMode,
    evidenceAnchors: input.evidenceAnchors ?? [],
  };
}

export function normalizeMatcherText(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^\p{L}\p{N}'-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchTokens(value: string | null | undefined): string[] {
  return normalizeMatcherText(value)
    .split(/\s+/)
    .map((token) => token.replace(/^['-]+|['-]+$/g, ''))
    .filter((token) => token.length >= MATCHER_LIMITS.minTokenLength);
}

export function matchTokenSet(value: string | null | undefined): Set<string> {
  return new Set(matchTokens(value));
}

export function jaccardTokenSimilarity(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  const leftTokens = matchTokenSet(left);
  const rightTokens = matchTokenSet(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let shared = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) shared += 1;
  });
  return shared / Math.max(1, leftTokens.size + rightTokens.size - shared);
}

export function tokenContainmentSimilarity(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  const leftTokens = matchTokenSet(left);
  const rightTokens = matchTokenSet(right);
  if (leftTokens.size < 2 || rightTokens.size < 2) return 0;
  let shared = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) shared += 1;
  });
  return shared / leftTokens.size;
}

export function sharesAnyMatchToken(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const leftTokens = matchTokenSet(left);
  return matchTokens(right).some((token) => leftTokens.has(token));
}

export function normalizedIsbnText(value: string | null | undefined): string {
  return cleanedIsbn(value).toLowerCase();
}

export function isbnAppearsInText(
  isbn: string | null | undefined,
  text: string | null | undefined,
): boolean {
  const normalized = normalizedIsbnText(isbn);
  return Boolean(normalized && normalizedIsbnText(text).includes(normalized));
}

const AUTHOR_SPLIT_PATTERN = /\s*(?:\/|;|&|\band\b)\s*/i;
const AUTHOR_INITIAL_PATTERN = /^[a-z]$/i;

export function authorEvidenceTokens(
  authors: string[] | null | undefined,
): Set<string> {
  const evidence = new Set<string>();
  for (const author of authors ?? []) {
    const segments = String(author)
      .split(AUTHOR_SPLIT_PATTERN)
      .map((part) => part.trim())
      .filter(Boolean);
    for (const segment of segments) {
      const tokens = normalizeMatcherText(segment.replace(/[.]/g, ' '))
        .split(/\s+/)
        .map((token) => token.replace(/^['-]+|['-]+$/g, ''))
        .filter(Boolean);
      tokens.forEach((token, index) => {
        const next = tokens[index + 1];
        if (
          AUTHOR_INITIAL_PATTERN.test(token) &&
          next &&
          next.length >= MATCHER_LIMITS.minTokenLength
        ) {
          evidence.add(next);
        }
      });
      const last = tokens.at(-1);
      if (
        last &&
        !AUTHOR_INITIAL_PATTERN.test(last) &&
        last.length >= MATCHER_LIMITS.minTokenLength
      ) {
        evidence.add(last);
      }
    }
  }
  return evidence;
}

export function authorAppearsInText(
  authors: string[] | null | undefined,
  text: string | null | undefined,
): boolean {
  const candidateTokens = matchTokenSet(text);
  if (!authors?.length || !candidateTokens.size) return false;
  for (const token of authorEvidenceTokens(authors)) {
    if (candidateTokens.has(token)) return true;
  }
  return authors.some((author) => {
    const tokens = matchTokens(author);
    const lastName = tokens.at(-1);
    if (lastName && candidateTokens.has(lastName)) return true;
    const shared = tokens.filter((token) => candidateTokens.has(token)).length;
    return tokens.length > 1 && shared >= Math.min(2, tokens.length);
  });
}

function candidateIsbnMatches(
  isbn: string | null | undefined,
  candidate: BookMatchCandidate,
): boolean {
  const targetIsbn = normalizedIsbnText(isbn);
  if (!targetIsbn) return false;
  const values = Array.isArray(candidate.isbn)
    ? candidate.isbn
    : [candidate.isbn];
  return values.some((value) => normalizedIsbnText(value) === targetIsbn);
}

function exactTitleMatch(targetTitle: string, candidateTitle: string): boolean {
  return (
    normalizeMatcherText(targetTitle) !== '' &&
    normalizeMatcherText(targetTitle) === normalizeMatcherText(candidateTitle)
  );
}

export function bookMatchDecision(input: {
  target: BookMatchTarget;
  candidate: BookMatchCandidate;
  sourceMode: MatcherSourceMode;
  minimumScore?: number;
}): MatcherDecision {
  const target = input.target;
  const candidate = input.candidate;
  const candidateText = [
    candidate.title ?? '',
    candidate.text ?? '',
    ...(candidate.authors ?? []),
  ].join(' ');
  const candidateTitle = candidate.title ?? candidate.text ?? '';
  const titleScore = Math.max(
    jaccardTokenSimilarity(target.title, candidateTitle),
    tokenContainmentSimilarity(target.title, candidateTitle),
  );
  const shortScore = Math.max(
    jaccardTokenSimilarity(target.short || target.title, candidateTitle),
    tokenContainmentSimilarity(target.short || target.title, candidateTitle),
  );
  const titleBase = Math.max(titleScore, shortScore);
  const authorText = (target.authors ?? []).join(' ');
  const candidateAuthorText = (candidate.authors ?? []).join(' ');
  const authorSimilarity = Math.max(
    jaccardTokenSimilarity(authorText, candidateText),
    jaccardTokenSimilarity(authorText, candidateAuthorText),
  );
  const authorScore =
    authorText && titleBase > MATCHER_LIMITS.authorSupportTitleFloor
      ? authorSimilarity * MATCHER_LIMITS.authorScoreWeight
      : 0;
  const isbnMatch =
    candidateIsbnMatches(target.isbn, candidate) ||
    isbnAppearsInText(target.isbn, candidateText);
  const exactTitle = exactTitleMatch(target.title, candidateTitle);
  const score = isbnMatch ? 1 : Math.min(1, titleBase + authorScore);
  const minimumScore = input.minimumScore ?? MATCHER_LIMITS.weakBookMatchScore;
  const reasons = [
    isbnMatch ? 'isbn_match' : '',
    exactTitle ? 'exact_title' : '',
    titleBase >= MATCHER_LIMITS.closeTitleScore ? 'close_title' : '',
    authorSimilarity >= MATCHER_LIMITS.genericTitleAuthorFloor
      ? 'author_support'
      : '',
  ].filter(Boolean);
  const rejectedReasons = [
    score < minimumScore ? 'below_minimum_score' : '',
    !candidateTitle && !candidate.text ? 'missing_candidate_title' : '',
  ].filter(Boolean);
  return matcherDecision({
    accepted: score >= minimumScore,
    score,
    sourceMode: input.sourceMode,
    reasons,
    rejectedReasons,
    evidenceAnchors: [candidateTitle, candidateAuthorText].filter(Boolean),
  });
}

export function genericTitleAuthorConflict(
  target: BookMatchTarget,
  candidate: BookMatchCandidate,
): boolean {
  const titleTokens = matchTokenSet(target.title);
  const authorText = (target.authors ?? []).join(' ');
  const candidateAuthorText = [
    ...(candidate.authors ?? []),
    candidate.text ?? '',
  ].join(' ');
  if (titleTokens.size > MATCHER_LIMITS.genericTitleTokenLimit) return false;
  if (!authorText || !candidateAuthorText) return false;
  return (
    jaccardTokenSimilarity(authorText, candidateAuthorText) <
    MATCHER_LIMITS.genericTitleAuthorFloor
  );
}
