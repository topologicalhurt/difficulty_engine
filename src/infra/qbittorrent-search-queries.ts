import type { QbittorrentSearchIntent } from '../core/types';
import {
  normalizeMatcherText,
  sharesAnyMatchToken,
} from '../core/matchers';
import { uniqueCompactStrings } from '../core/utils';
import type { DocumentAcquisitionRequest } from './document-acquisition';
import { normalizedBookIsbn } from './qbittorrent-selection';

const MAX_QBITTORRENT_SEARCH_PATTERNS = 14;
const SEARCH_NOISE_WORD_PATTERN =
  /\b(?:\d+(?:st|nd|rd|th)?\s*,\s*)?(?:(?:\d+(?:st|nd|rd|th)?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:edition|ed\.?)|(?:edition|ed\.?)\s*\d+|\d+\s*ed\.?|revised|updated|international|student|instructor'?s?|solutions?|manual|workbook|companion)\b/gi;
const SEARCH_YEAR_PATTERN = /\b(?:19|20)\d{2}\b/g;
const TITLE_TRAILING_DETAIL_PATTERN = /\s*(?::|\(|\s[-–—]\s).*$/;
const TITLE_SEGMENT_SEPARATOR_PATTERN = /\s*(?:[:()]+|\s[-–—]\s|\.)\s*/;
const MIN_SEARCH_TOKEN_LENGTH = 3;
const AUTHOR_SEPARATOR_PATTERN = /\s*(?:\/|;|,|&|\band\b)\s*/i;
const INITIAL_PATTERN = /^[a-z]$/i;

export interface QbittorrentSearchQuery {
  intent: QbittorrentSearchIntent;
  pattern: string;
}

function compactSearchText(value: string): string {
  return normalizeMatcherText(
    value
      .replace(SEARCH_NOISE_WORD_PATTERN, ' ')
      .replace(SEARCH_YEAR_PATTERN, ' ')
      .replace(/[,:;]+/g, ' ')
      .replace(/[()[\]{}]/g, ' '),
  );
}

function dehyphenatedSearchText(value: string): string {
  return compactSearchText(value.replace(/[-‐‑‒–—]/g, ' '));
}

function titleCore(title: string, fallback: string): string {
  const withoutDetail = title.replace(TITLE_TRAILING_DETAIL_PATTERN, '');
  return dehyphenatedSearchText(withoutDetail || fallback || title);
}

function titleWithoutSubtitle(title: string): string {
  return dehyphenatedSearchText(title.replace(TITLE_TRAILING_DETAIL_PATTERN, ''));
}

function sharesSearchToken(left: string, right: string): boolean {
  return (
    left.length >= MIN_SEARCH_TOKEN_LENGTH && sharesAnyMatchToken(left, right)
  );
}

function titleSearchVariants(title: string, shortTitle: string): string[] {
  const compactTitle = compactSearchText(title);
  const titleWithoutTrailingDetail = compactSearchText(
    title.replace(TITLE_TRAILING_DETAIL_PATTERN, ''),
  );
  return uniqueCompactStrings(
    [
      compactTitle,
      titleWithoutTrailingDetail,
      sharesSearchToken(compactTitle, shortTitle) ? shortTitle : '',
    ].map(compactSearchText),
  );
}

function authorSurnameTokens(value: string): string[] {
  const rawTokens = value.replace(/[.]/g, ' ').split(/\s+/).filter(Boolean);
  const afterInitials = rawTokens
    .flatMap((token, index) =>
      INITIAL_PATTERN.test(token) && rawTokens[index + 1]
        ? [rawTokens[index + 1]]
        : [],
    )
    .map(compactSearchText)
    .filter((token) => token.length > 2);
  if (afterInitials.length) return afterInitials;
  const normalized = compactSearchText(value);
  const parts = normalized.split(/\s+/).filter(Boolean);
  return parts.length ? [parts[parts.length - 1]].filter(Boolean) : [];
}

function authorSearchVariants(authors: string[]): string[] {
  const segments = authors.flatMap((author) =>
    String(author)
      .split(AUTHOR_SEPARATOR_PATTERN)
      .map((part) => part.trim())
      .filter(Boolean),
  );
  const surnames = segments.flatMap(authorSurnameTokens);
  return uniqueCompactStrings(surnames.map(compactSearchText)).filter(
    (author) => author.length > 2,
  );
}

function stripAuthorPrefixFromTitle(title: string, authors: string[]): string {
  const surnames = authorSearchVariants(authors);
  for (const surname of surnames) {
    const escaped = surname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prefix = new RegExp(
      `^\\s*${escaped}(?:\\s+[a-z]\\.){0,3}\\s*(?:[.:\\-–—]+\\s*)?`,
      'i',
    );
    const stripped = title.replace(prefix, '').trim();
    if (stripped !== title.trim() && compactSearchText(stripped)) {
      return stripped;
    }
  }
  return title;
}

function titleSegments(title: string, authors: string[]): string[] {
  const withoutAuthor = stripAuthorPrefixFromTitle(title, authors);
  return uniqueCompactStrings(
    withoutAuthor
      .split(TITLE_SEGMENT_SEPARATOR_PATTERN)
      .map(compactSearchText)
      .filter((segment) => segment.split(/\s+/).length >= 1),
  );
}

function distinctiveTitleTokens(title: string): string[] {
  return title
    .split(/\s+/)
    .filter((token) => token.length >= MIN_SEARCH_TOKEN_LENGTH)
    .filter(
      (token) => !/^(?:the|and|for|with|from|into|edition|ed)$/.test(token),
    )
    .slice(0, 4);
}

function pushQuery(
  queries: QbittorrentSearchQuery[],
  seen: Set<string>,
  intent: QbittorrentSearchIntent,
  pattern: string,
): void {
  const compact = compactSearchText(pattern);
  if (!compact || seen.has(compact)) return;
  seen.add(compact);
  queries.push({ intent, pattern: compact });
}

export function customQbittorrentSearchQuery(
  pattern: string,
): QbittorrentSearchQuery {
  return { intent: 'custom_query', pattern: compactSearchText(pattern) };
}

export function qbittorrentSearchQueries(
  request: DocumentAcquisitionRequest,
): QbittorrentSearchQuery[] {
  const isbn = normalizedBookIsbn(request.book.isbn);
  const seen = new Set<string>();
  const queries: QbittorrentSearchQuery[] = [];
  const searchableTitle = stripAuthorPrefixFromTitle(
    request.book.title,
    request.book.authors,
  );
  const segments = titleSegments(request.book.title, request.book.authors);
  const titleHead = segments[0] || request.book.short || searchableTitle;
  const subtitle = segments.slice(1).find((segment) =>
    segment.split(/\s+/).some((token) => token.length >= MIN_SEARCH_TOKEN_LENGTH),
  );
  const canonicalTitle = compactSearchText(searchableTitle);
  const coreTitle = titleCore(searchableTitle, request.book.short);
  const withoutSubtitle =
    titleHead && titleHead !== canonicalTitle
      ? titleHead
      : titleWithoutSubtitle(searchableTitle);
  const dehyphenatedTitle = dehyphenatedSearchText(searchableTitle);
  const hyphenatedTitle = compactSearchText(
    searchableTitle.replace(SEARCH_NOISE_WORD_PATTERN, ' '),
  );
  const titles = titleSearchVariants(searchableTitle, request.book.short);
  const authors = authorSearchVariants(request.book.authors);
  const authorPhrase = authors.slice(0, 2).join(' ');
  const topicPhrase = distinctiveTitleTokens(coreTitle).slice(-2).join(' ');
  const subtitleDistinctive = subtitle
    ? distinctiveTitleTokens(subtitle).join(' ')
    : '';

  pushQuery(queries, seen, 'isbn_exact', isbn);
  if (!canonicalTitle.includes('-')) {
    pushQuery(queries, seen, 'canonical_title', canonicalTitle);
  }
  pushQuery(queries, seen, 'core_title', coreTitle);
  pushQuery(queries, seen, 'title_without_subtitle', withoutSubtitle);
  pushQuery(queries, seen, 'dehyphenated_title', dehyphenatedTitle);
  if (subtitle) {
    pushQuery(queries, seen, 'subtitle_phrase', subtitle);
    pushQuery(queries, seen, 'subtitle_distinctive', subtitleDistinctive);
    pushQuery(
      queries,
      seen,
      'title_subtitle_core',
      `${withoutSubtitle} ${subtitleDistinctive || subtitle}`,
    );
  }
  if (authorPhrase) {
    if (subtitle) {
      pushQuery(
        queries,
        seen,
        'author_subtitle',
        `${authorPhrase} ${subtitleDistinctive || subtitle}`,
      );
    }
    pushQuery(
      queries,
      seen,
      'core_title_author',
      `${coreTitle} ${authorPhrase}`,
    );
    pushQuery(
      queries,
      seen,
      'author_topic',
      `${authorPhrase} ${topicPhrase || coreTitle}`,
    );
    pushQuery(
      queries,
      seen,
      'author_title_core',
      `${authorPhrase} ${withoutSubtitle}`,
    );
  }
  if (hyphenatedTitle.includes('-')) {
    pushQuery(queries, seen, 'hyphenated_title', hyphenatedTitle);
  }
  pushQuery(
    queries,
    seen,
    'distinctive_tokens',
    distinctiveTitleTokens(coreTitle).join(' '),
  );
  for (const title of titles) pushQuery(queries, seen, 'broad_recall', title);

  return queries.slice(0, MAX_QBITTORRENT_SEARCH_PATTERNS);
}

export function qbittorrentSearchPatterns(
  request: DocumentAcquisitionRequest,
): string[] {
  return qbittorrentSearchQueries(request).map((query) => query.pattern);
}
