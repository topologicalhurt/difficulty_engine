import { describe, expect, it } from 'vitest';

import { applyAiProposalToProject } from '../../src/app/store-ai-apply';
import type { AiRecommendationProposal } from '../../src/core/types';
import { makeBook, makeProject } from './store-test-utils';

describe('AI recommendation apply contract', () => {
  it('applies recommender proposals only as add, remove, and order changes', () => {
    const project = makeProject({
      books: {
        keep: makeBook({
          id: 'keep',
          title: 'Keep Book',
          authors: ['Keep Author'],
          manualPrereqs: ['remove'],
          manualCoStudy: ['remove'],
          planOrder: 0,
          pages: 300,
          owned: true,
        }),
        remove: makeBook({
          id: 'remove',
          title: 'Remove Book',
          planOrder: 1,
        }),
        tail: makeBook({
          id: 'tail',
          title: 'Tail Book',
          planOrder: 2,
        }),
      },
      constraints: { tl: 12 },
    });
    const proposal: AiRecommendationProposal = {
      id: 'proposal-add-remove-order',
      provider: 'openai',
      model: 'test-model',
      prompt: 'swap one book and place the new book first',
      summary: 'Replace one book and reorder.',
      books: [
        {
          proposalId: 'new-core',
          title: 'New Core Book',
          authors: ['New Author'],
          isbn: null,
          pages: 240,
          subjects: ['testing'],
          displayGroup: 'Core',
          manualSeedDifficulty: 7,
          rationale: 'A better fit.',
          prerequisiteIds: ['keep'],
          coStudyIds: ['tail'],
        },
      ],
      removeBookIds: ['remove'],
      bookOrder: ['new-core', 'keep', 'tail'],
      warnings: [],
      projectSettings: [
        {
          key: 'constraints.tl',
          currentValue: '12',
          suggestedValue: '24',
          confidence: 1,
          rationale: 'Display-only suggestion.',
        },
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      contextDigest: 'test-digest',
    };

    const result = applyAiProposalToProject(project, proposal);
    const books = result.project.library.books;
    const added = books[result.addedIds[0] ?? ''];

    expect(books.remove).toBeUndefined();
    expect(result.removedIds).toEqual(['remove']);
    expect(added).toMatchObject({
      title: 'New Core Book',
      manualPrereqs: [],
      manualCoStudy: [],
      planOrder: 0,
    });
    expect(books.keep).toMatchObject({
      title: 'Keep Book',
      authors: ['Keep Author'],
      manualPrereqs: [],
      manualCoStudy: [],
      pages: 300,
      owned: true,
      planOrder: 1,
    });
    expect(books.tail?.planOrder).toBe(2);
    expect(result.project.constraints.tl).toBe(12);
  });

  it('does not reorder existing books unless bookOrder is explicit', () => {
    const project = makeProject({
      books: {
        keep: makeBook({ id: 'keep', title: 'Keep Book', planOrder: 5 }),
        tail: makeBook({ id: 'tail', title: 'Tail Book', planOrder: 9 }),
      },
    });
    const proposal: AiRecommendationProposal = {
      id: 'proposal-add-only',
      provider: 'openai',
      model: 'test-model',
      prompt: 'add one book only',
      summary: 'Add without ordering.',
      books: [
        {
          proposalId: 'new-core',
          title: 'New Core Book',
          authors: ['New Author'],
          isbn: null,
          pages: 240,
          subjects: ['testing'],
          displayGroup: 'Core',
          manualSeedDifficulty: 7,
          rationale: 'A better fit.',
          prerequisiteIds: [],
          coStudyIds: [],
        },
      ],
      removeBookIds: [],
      bookOrder: [],
      warnings: [],
      projectSettings: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      contextDigest: 'test-digest',
    };

    const result = applyAiProposalToProject(project, proposal);
    const added = result.project.library.books[result.addedIds[0] ?? ''];

    expect(result.reordered).toBe(false);
    expect(result.project.library.books.keep?.planOrder).toBe(5);
    expect(result.project.library.books.tail?.planOrder).toBe(9);
    expect(added?.planOrder).toBe(10);
  });
});
