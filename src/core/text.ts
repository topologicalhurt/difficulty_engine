import {
  ADVANCED_CUES,
  BRIDGE_CUES,
  CONTAINMENT_SIMILARITY_HINT,
  INTRO_CUES,
  MAX_PHRASE_NGRAM,
  SERIES_PATTERN,
  STOP_WORDS,
  TEXT_SIMILARITY_CACHE_LIMIT,
} from './constants';
import { safeNumber } from './utils';

const similarityTokenSetCache = new Map<string, Set<string>>();
const textSimilarityCache = new Map<string, number>();

export function titleShort(title: string, id: string): string {
  const raw = String(title || id || 'Untitled').trim();
  return (
    raw.split(':')[0]?.split('—')[0]?.split('(')[0]?.trim().slice(0, 28) ||
    raw.slice(0, 28) ||
    'Untitled'
  );
}

export function normalizeText(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s\-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stemWord(word: string): string {
  let next = String(word || '').trim();
  if (next.length <= 3) return next;
  if (/ies$/.test(next) && next.length > 4) next = `${next.slice(0, -3)}y`;
  else if (/sses$/.test(next)) next = next.slice(0, -2);
  else if (/ing$/.test(next) && next.length > 5) next = next.slice(0, -3);
  else if (/ed$/.test(next) && next.length > 4) next = next.slice(0, -2);
  else if (/es$/.test(next) && next.length > 4) next = next.slice(0, -2);
  else if (/s$/.test(next) && next.length > 4) next = next.slice(0, -1);
  return next;
}

export function tokenizeWords(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .map(stemWord)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

export function canonicalPhrase(phrase: string): string {
  return tokenizeWords(phrase).join(' ').trim();
}

export function phraseCandidates(
  text: string,
  maxN = MAX_PHRASE_NGRAM,
): string[] {
  const tokens = tokenizeWords(text);
  const nLimit = Math.max(1, Math.min(MAX_PHRASE_NGRAM, maxN));
  const output: string[] = [];
  for (let n = 1; n <= Math.min(nLimit, tokens.length); n += 1) {
    for (let i = 0; i <= tokens.length - n; i += 1) {
      const phrase = tokens.slice(i, i + n).join(' ');
      if (phrase.length >= 3) {
        output.push(phrase);
      }
    }
  }
  return output;
}

export function textSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  const cacheKey = left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
  const cached = textSimilarityCache.get(cacheKey);
  if (cached != null) return cached;
  const leftTokens = tokenSetForSimilarity(left);
  const rightTokens = tokenSetForSimilarity(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  let shared = 0;
  leftTokens.forEach((token) => {
    if (rightTokens.has(token)) shared += 1;
  });
  const jaccard =
    shared / Math.max(1, leftTokens.size + rightTokens.size - shared);
  const containment =
    String(left || '').includes(String(right || '')) ||
    String(right || '').includes(String(left || ''))
      ? CONTAINMENT_SIMILARITY_HINT
      : 0;
  const similarity = Math.max(containment, jaccard);
  rememberTextSimilarity(cacheKey, similarity);
  return similarity;
}

function tokenSetForSimilarity(text: string): Set<string> {
  const cached = similarityTokenSetCache.get(text);
  if (cached) return cached;
  const tokenSet = new Set(tokenizeWords(text));
  if (similarityTokenSetCache.size >= TEXT_SIMILARITY_CACHE_LIMIT) {
    similarityTokenSetCache.clear();
  }
  similarityTokenSetCache.set(text, tokenSet);
  return tokenSet;
}

function rememberTextSimilarity(key: string, similarity: number): void {
  if (textSimilarityCache.size >= TEXT_SIMILARITY_CACHE_LIMIT) {
    textSimilarityCache.clear();
  }
  textSimilarityCache.set(key, similarity);
}

export function countTokens(tokens: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  tokens.forEach((token) => {
    counts[token] = (counts[token] || 0) + 1;
  });
  return counts;
}

export function weightedCoverage(
  leftCounts: Record<string, number>,
  rightCounts: Record<string, number>,
  documentFrequency: Record<string, number>,
  documentCount: number,
): number {
  const keys = Object.keys(leftCounts);
  if (!keys.length) return 0;
  let shared = 0;
  let total = 0;
  keys.forEach((key) => {
    const idf = Math.log(
      1 + documentCount / Math.max(1, documentFrequency[key] || 1),
    );
    total += (leftCounts[key] || 0) * idf;
    if (rightCounts[key]) {
      shared += Math.min(leftCounts[key] || 0, rightCounts[key] || 0) * idf;
    }
  });
  return total ? shared / total : 0;
}

export function cuePresence(text: string, cues: string[]): number {
  const normalized = normalizeText(text);
  return cues.some((cue) => normalized.includes(cue)) ? 1 : 0;
}

export function cueProfileForBook(
  title: string,
  short: string,
  subjects: string[],
  chapterTitles: string[],
  description: string,
): { intro: number; advanced: number; bridge: number } {
  const text = [
    title,
    short,
    ...subjects,
    ...chapterTitles,
    description || '',
  ].join(' ');
  return {
    intro: cuePresence(text, INTRO_CUES),
    advanced: cuePresence(text, ADVANCED_CUES),
    bridge: cuePresence(text, BRIDGE_CUES),
  };
}

export function parseSeriesInfo(title: string): {
  index: number | null;
  key: string;
} {
  const raw = String(title || '');
  const volume = raw.match(SERIES_PATTERN);
  const cleaned = raw
    .replace(/(?:vol(?:ume)?|part|book|bk)\.?\s*\d+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return {
    index: volume ? Number.parseInt(volume[1] || '', 10) : null,
    key: cleaned.replace(/[^a-z0-9]+/g, ''),
  };
}

export function normalizeNumericString(
  value: string | number | undefined | null,
  fallback: number,
): number {
  return safeNumber(value, fallback);
}
