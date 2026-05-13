import { describe, expect, it, vi } from 'vitest';

import type {
  AiRecommendationProvider,
  AiRecommendationProviderResponse,
  AiRelationshipProviderResponse,
} from '../../src/core/types';
import { makeBook, makeProject, makeStore } from './store-test-utils';

function aiRelationshipProvider(): AiRecommendationProvider {
  return {
    recommend: vi.fn(async (): Promise<AiRecommendationProviderResponse> => ({
      summary: 'unused',
      books: [],
      warnings: [],
    })),
    reorganizeRelationships: vi.fn(async (request) => ({
      summary: `Progression for ${request.context.books.length} book(s).`,
      stages: [
        {
          label: 'Foundations',
          bookIds: ['book-1'],
          rationale: 'Start with the shared base.',
        },
        {
          label: 'Applications',
          bookIds: ['book-2', 'book-3'],
          rationale: 'Then move into application tracks.',
        },
      ],
      relations: [
        {
          from: 'book-1',
          to: 'book-2',
          type: 'prerequisite',
          confidence: 0.93,
          rationale: 'Book 1 supplies the vocabulary for book 2.',
        },
        {
          from: 'book-2',
          to: 'book-3',
          type: 'co-study',
          confidence: 0.75,
          rationale: 'These can reinforce each other.',
        },
      ],
      warnings: ['Review the co-study pairing before applying.'],
    })),
  };
}

describe('AI relationship reorganizer flow', () => {
  it('requests and applies a reviewed relationship progression proposal', async () => {
    const provider = aiRelationshipProvider();
    const store = makeStore({
      initialProject: makeProject({
        books: {
          'book-1': makeBook({
            id: 'book-1',
            title: 'Foundations',
            planOrder: 2,
          }),
          'book-2': makeBook({
            id: 'book-2',
            title: 'Applications',
            planOrder: 0,
          }),
          'book-3': makeBook({
            id: 'book-3',
            title: 'Lab Track',
            planOrder: 1,
          }),
        },
      }),
      aiRecommendationProvider: provider,
    });

    store.commands.updateAiLocalSettings({
      enabled: true,
      apiKey: 'local-secret',
      model: 'gpt-test',
    });
    store.commands.updateAiRelationshipWizard({
      strictness: 'rebuild_from_scratch',
      preserveManualRelations: false,
      notes: 'Make the path application oriented.',
    });
    await store.commands.requestAiRelationshipReorganization();

    expect(provider.reorganizeRelationships).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-test',
        wizard: expect.objectContaining({
          strictness: 'rebuild_from_scratch',
          notes: 'Make the path application oriented.',
        }),
      }),
    );
    expect(
      store.selectors.getState().ui.aiRelationshipProposal?.relations,
    ).toHaveLength(2);

    store.commands.applyAiRelationshipProposal();
    const books = store.selectors.getProject().library.books;
    expect(books['book-1']?.planOrder).toBe(0);
    expect(books['book-2']?.manualPrereqs).toEqual(['book-1']);
    expect(books['book-2']?.manualCoStudy).toEqual(['book-3']);
    expect(books['book-3']?.manualCoStudy).toEqual(['book-2']);
    expect(store.selectors.getState().ui.aiRelationshipProposal).toBeNull();
    expect(store.exportProject()).not.toContain('local-secret');
  });

  it('ignores stale relationship responses after AI settings change', async () => {
    let resolveRelationship!: (
      response: AiRelationshipProviderResponse,
    ) => void;
    const provider: AiRecommendationProvider = {
      recommend: vi.fn(async (): Promise<AiRecommendationProviderResponse> => ({
        summary: 'unused',
        books: [],
        warnings: [],
      })),
      reorganizeRelationships: vi.fn(
        async () =>
          new Promise<AiRelationshipProviderResponse>((resolve) => {
            resolveRelationship = resolve;
          }),
      ),
    };
    const store = makeStore({ aiRecommendationProvider: provider });

    store.commands.updateAiLocalSettings({
      enabled: true,
      apiKey: 'local-secret',
      model: 'gpt-test',
    });
    const request = store.commands.requestAiRelationshipReorganization();
    expect(store.selectors.getState().ui.aiRelationshipStatus.state).toBe(
      'loading',
    );

    store.commands.updateAiLocalSettings({
      endpointUrl: 'https://example.com/proxy',
    });
    resolveRelationship({
      summary: 'Stale relationship proposal.',
      stages: [{ label: 'Stale', bookIds: ['book-1'], rationale: 'Old.' }],
      relations: [],
      warnings: [],
    });
    await request;

    expect(store.selectors.getState().ui.aiRelationshipProposal).toBeNull();
    expect(store.selectors.getState().ui.aiRelationshipStatus.state).toBe(
      'idle',
    );
  });

  it('clears old manual links when rebuilding relationships from scratch', async () => {
    const provider = aiRelationshipProvider();
    const store = makeStore({
      initialProject: makeProject({
        books: {
          'book-1': makeBook({
            id: 'book-1',
            title: 'Foundations',
            planOrder: 2,
          }),
          'book-2': makeBook({
            id: 'book-2',
            title: 'Applications',
            manualPrereqs: ['book-3'],
            manualCoStudy: ['book-1'],
            planOrder: 0,
          }),
          'book-3': makeBook({
            id: 'book-3',
            title: 'Lab Track',
            manualCoStudy: ['book-2'],
            planOrder: 1,
          }),
        },
      }),
      aiRecommendationProvider: provider,
    });

    store.commands.updateAiLocalSettings({
      enabled: true,
      apiKey: 'local-secret',
      model: 'gpt-test',
    });
    store.commands.updateAiRelationshipWizard({
      strictness: 'rebuild_from_scratch',
      preserveManualRelations: true,
    });
    await store.commands.requestAiRelationshipReorganization();
    store.commands.applyAiRelationshipProposal();

    const books = store.selectors.getProject().library.books;
    expect(books['book-2']?.manualPrereqs).toEqual(['book-1']);
    expect(books['book-2']?.manualCoStudy).toEqual(['book-3']);
    expect(books['book-3']?.manualCoStudy).toEqual(['book-2']);
  });
});
