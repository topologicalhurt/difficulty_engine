import { cleanedIsbn, isIsbnLikeInput, isValidIsbn, normalizedIsbn } from '../core/isbn';

export const DEFAULT_SEARCH_PAGE_SIZE = 15;
export const MIN_TEXT_SEARCH_CHARS = 2;
export const MIN_PARTIAL_ISBN_CHARS = 5;

export { cleanedIsbn };

export function isLikelyIsbnQuery(query: string): boolean {
  return isIsbnLikeInput(query);
}

export function isFullIsbnQuery(query: string): boolean {
  return isValidIsbn(query);
}

export function isCatalogQueryReady(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) {
    return false;
  }
  if (isLikelyIsbnQuery(trimmed)) {
    return cleanedIsbn(trimmed).length >= MIN_PARTIAL_ISBN_CHARS;
  }
  return trimmed.length >= MIN_TEXT_SEARCH_CHARS;
}

export function openLibrarySearchParams(
  query: string,
  options: { offset?: number; limit?: number } = {},
): URLSearchParams {
  const trimmed = query.trim();
  const limit = String(options.limit ?? DEFAULT_SEARCH_PAGE_SIZE);
  if (isFullIsbnQuery(trimmed)) {
    return new URLSearchParams({
      isbn: normalizedIsbn(trimmed),
      limit,
    });
  }
  const params = new URLSearchParams({
    q: trimmed,
    limit,
  });
  if ((options.offset ?? 0) > 0) {
    params.set('offset', String(options.offset));
  }
  return params;
}

export function openLibraryFallbackSearchParams(
  query: string,
  options: { offset?: number; limit?: number } = {},
): URLSearchParams {
  const params = new URLSearchParams({
    title: query.trim(),
    limit: String(options.limit ?? DEFAULT_SEARCH_PAGE_SIZE),
  });
  if ((options.offset ?? 0) > 0) {
    params.set('offset', String(options.offset));
  }
  return params;
}
