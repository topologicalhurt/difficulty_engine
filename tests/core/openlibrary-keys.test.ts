import { describe, expect, it } from 'vitest';

import { normalizeOpenLibraryKey } from '../../src/core/openlibrary-keys';

describe('Open Library key normalization', () => {
  it('normalizes work and edition keys to canonical paths', () => {
    expect(normalizeOpenLibraryKey('/works/OL123W', 'work')).toBe(
      '/works/OL123W',
    );
    expect(
      normalizeOpenLibraryKey(
        'https://openlibrary.org/books/OL456M',
        'edition',
      ),
    ).toBe('/books/OL456M');
    expect(normalizeOpenLibraryKey('OL456M', 'edition')).toBe('/books/OL456M');
  });

  it('rejects keys with the wrong type or arbitrary URL/path content', () => {
    expect(normalizeOpenLibraryKey('/works/OL123W', 'edition')).toBeNull();
    expect(normalizeOpenLibraryKey('/books/OL456M', 'work')).toBeNull();
    expect(
      normalizeOpenLibraryKey('https://example.com/books/OL456M', 'edition'),
    ).toBeNull();
    expect(normalizeOpenLibraryKey('../books/OL456M', 'edition')).toBeNull();
  });
});
