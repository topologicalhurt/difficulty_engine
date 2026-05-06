import { describe, expect, it } from 'vitest';

import {
  contentKindFromUrl,
  contentTypeFromPath,
  isPdfDocument,
} from '../../src/infra/qbittorrent-file-kinds';

describe('document file kind helpers', () => {
  it('centralizes content kind, type, and PDF detection', () => {
    expect(contentKindFromUrl('book_djvu.txt')).toBe('ocr_text');
    expect(contentTypeFromPath('book.epub')).toBe('application/epub+zip');
    expect(isPdfDocument('https://example.test/book.pdf?download=1')).toBe(
      true,
    );
    expect(isPdfDocument('https://example.test/book', 'application/pdf')).toBe(
      true,
    );
  });
});
