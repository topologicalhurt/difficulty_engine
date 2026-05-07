import { describe, expect, it } from 'vitest';

import { findMatchingBook } from '../../src/core/book-identity';
import type { PlannerProjectV1 } from '../../src/core/types';
import { makeBook, makeProject } from '../app/store-test-utils';

describe('book identity matching', () => {
  it('reuses shared matcher normalization for accented duplicate titles', () => {
    const project: PlannerProjectV1 = makeProject({
      books: {
        'book-accented': makeBook({
          id: 'book-accented',
          title: 'Café Circuits: A Builder’s Guide',
          authors: ['Zoë Engineer'],
        }),
      },
    });

    const match = findMatchingBook(project, {
      title: "Cafe Circuits - A Builder's Guide",
      authors: ['Zoe Engineer'],
      isbn: null,
    });

    expect(match?.id).toBe('book-accented');
  });
});
