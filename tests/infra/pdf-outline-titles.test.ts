import { describe, expect, it } from 'vitest';

import { extractPdfOutlineTitles } from '../../src/infra/pdf-outline-titles';

function pdfBytes(content: string): Uint8Array {
  return new TextEncoder().encode(content);
}

describe('PDF outline title extraction', () => {
  it('keeps titles whose parentheses are PDF-escaped', () => {
    const titles = extractPdfOutlineTitles(
      pdfBytes(
        [
          '/Title (Chapter 1 \\(Intro\\) Signals)',
          '/Title (Chapter 2 Methods)',
          '/Title (Chapter 3 Results)',
        ].join('\n'),
      ),
    );

    // The escaped-paren title is captured in full (not truncated at "\)").
    const intro = titles.find((title) => title.startsWith('Chapter 1'));
    expect(intro).toBe('Chapter 1 (Intro) Signals');
  });
});
