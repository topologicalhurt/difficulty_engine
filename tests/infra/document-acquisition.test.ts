import { describe, expect, it } from 'vitest';

import type { SourceContentKind } from '../../src/core/types';
import {
  choosePreferredDocumentCandidate,
  defaultDocumentAcquisitionPolicy,
  isLawfulDocumentCandidate,
} from '../../src/infra/document-acquisition';

describe('document acquisition policy', () => {
  it('is disabled by default and rejects unknown legal basis', () => {
    const policy = defaultDocumentAcquisitionPolicy();
    const candidate = {
      id: 'candidate-1',
      provider: 'fixture',
      title: 'Fixture',
      sourceUrl: 'magnet:?xt=urn:btih:test',
      contentKind: 'pdf' as const,
      confidence: 0.8,
    };

    expect(policy.enabled).toBe(false);
    expect(isLawfulDocumentCandidate(candidate, policy)).toBe(false);
    expect(choosePreferredDocumentCandidate([candidate], policy)).toBeNull();
  });

  it('prefers text before epub, OCR text, and pdf among lawful candidates', () => {
    const policy = { ...defaultDocumentAcquisitionPolicy(), enabled: true };
    const selected = choosePreferredDocumentCandidate(
      [
        {
          id: 'pdf',
          provider: 'fixture',
          title: 'PDF',
          sourceUrl: 'https://example.test/book.pdf',
          contentKind: 'pdf',
          accessBasis: 'open_access',
          confidence: 0.99,
        },
        {
          id: 'ocr',
          provider: 'fixture',
          title: 'OCR',
          sourceUrl: 'https://example.test/book_djvu.txt',
          contentKind: 'ocr_text',
          accessBasis: 'open_access',
          confidence: 0.95,
        },
        {
          id: 'epub',
          provider: 'fixture',
          title: 'EPUB',
          sourceUrl: 'https://example.test/book.epub',
          contentKind: 'epub',
          accessBasis: 'open_access',
          confidence: 0.92,
        },
        {
          id: 'txt',
          provider: 'fixture',
          title: 'Text',
          sourceUrl: 'https://example.test/book.txt',
          contentKind: 'text',
          accessBasis: 'open_access',
          confidence: 0.7,
        },
      ],
      policy,
    );

    expect(selected?.id).toBe('txt');
  });

  it('uses one shared content-preference order for candidate ranking', () => {
    const policy = {
      ...defaultDocumentAcquisitionPolicy(),
      enabled: true,
      contentPreference: [
        'epub',
        'text',
        'ocr_text',
        'pdf',
      ] as SourceContentKind[],
    };
    const selected = choosePreferredDocumentCandidate(
      [
        {
          id: 'txt',
          provider: 'fixture',
          title: 'Text',
          sourceUrl: 'https://example.test/book.txt',
          contentKind: 'text',
          accessBasis: 'open_access',
          confidence: 0.9,
        },
        {
          id: 'epub',
          provider: 'fixture',
          title: 'EPUB',
          sourceUrl: 'https://example.test/book.epub',
          contentKind: 'epub',
          accessBasis: 'open_access',
          confidence: 0.9,
        },
      ],
      policy,
    );

    expect(selected?.id).toBe('epub');
  });
});
