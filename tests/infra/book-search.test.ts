import { describe, expect, it } from 'vitest';

import {
  isCatalogQueryReady,
  isFullIsbnQuery,
  isLikelyIsbnQuery,
  openLibrarySearchParams,
} from '../../src/infra/book-search';
import { normalizedIsbn } from '../../src/core/isbn';

describe('book search query filtering', () => {
  it('accepts only checksum-valid full ISBNs for isbn-specific search', () => {
    expect(normalizedIsbn('978-1-2345-6789-7')).toBe('9781234567897');
    expect(isFullIsbnQuery('978-1-2345-6789-7')).toBe(true);
    expect(isFullIsbnQuery('9781234567890')).toBe(false);
    expect(openLibrarySearchParams('9781234567890').has('isbn')).toBe(false);
    expect(openLibrarySearchParams('9781234567897').get('isbn')).toBe('9781234567897');
  });

  it('does not classify malformed alphanumeric text as an ISBN query', () => {
    expect(isLikelyIsbnQuery('X12345')).toBe(false);
    expect(isLikelyIsbnQuery('12345X')).toBe(true);
    expect(isLikelyIsbnQuery('abc12345')).toBe(false);
    expect(isCatalogQueryReady('abc12345')).toBe(true);
  });
});
