import { describe, expect, it, vi } from 'vitest';

import type {
  AiRecommendationProvider,
  AiRecommendationProviderResponse,
} from '../../src/core/types';
import { makeBook, makeProject, makeStore } from './store-test-utils';

function aiProvider(): AiRecommendationProvider {
  return {
    recommend: vi.fn(async (request) => ({
      summary: `Using ${request.context.books.length} existing book(s).`,
      books: [
        {
          proposalId: 'rec-foundations',
          title: 'Practical Circuit Foundations',
          authors: ['A. Engineer'],
          isbn: '9781234567897',
          pages: 320,
          subjects: ['circuits', 'electronics'],
          displayGroup: 'Core',
          manualSeedDifficulty: 6.5,
          rationale: 'Adds the missing foundation before advanced electronics.',
          prerequisiteIds: ['book-1'],
          coStudyIds: [],
        },
        {
          proposalId: 'rec-lab',
          title: 'Electronics Lab Companion',
          authors: ['B. Builder'],
          pages: 180,
          subjects: ['electronics lab'],
          displayGroup: 'Applied',
          manualSeedDifficulty: 5,
          rationale: 'Pairs with the foundations recommendation.',
          prerequisiteIds: ['rec-foundations'],
          coStudyIds: ['book-2'],
        },
      ],
      warnings: ['Verify edition availability before buying.'],
    })),
  };
}

describe('AI recommendations store flow', () => {
  it('builds a compact DAG-aware request and applies reviewed proposals to the library', async () => {
    const provider = aiProvider();
    const store = makeStore({
      initialProject: makeProject({
        books: {
          'book-1': makeBook({
            id: 'book-1',
            title: 'Existing Foundations',
            planOrder: 0,
          }),
          'book-2': makeBook({
            id: 'book-2',
            title: 'Existing Lab',
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
    store.commands.setAiRecommendationPrompt(
      '   recommend electronics next steps   ',
    );
    await store.commands.requestAiRecommendations();

    expect(provider.recommend).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'recommend electronics next steps',
        model: 'gpt-test',
        maxSuggestions: 4,
        context: expect.objectContaining({
          books: expect.arrayContaining([
            expect.objectContaining({
              id: 'book-1',
              title: 'Existing Foundations',
            }),
          ]),
        }),
      }),
    );
    expect(store.selectors.getState().ui.aiProposal?.books).toHaveLength(2);

    store.commands.applyAiRecommendation();
    const books = store.selectors.getProject().library.books;
    const added = Object.values(books).filter(
      (book) =>
        book.title === 'Practical Circuit Foundations' ||
        book.title === 'Electronics Lab Companion',
    );
    expect(added).toHaveLength(2);
    const foundations = added.find(
      (book) => book.title === 'Practical Circuit Foundations',
    );
    const lab = added.find(
      (book) => book.title === 'Electronics Lab Companion',
    );
    expect(foundations?.manualPrereqs).toEqual(['book-1']);
    expect(lab?.manualPrereqs).toEqual([foundations?.id]);
    expect(lab?.manualCoStudy).toContain('book-2');
    expect(store.exportProject()).not.toContain('local-secret');
  });

  it('fails closed when provider settings are incomplete', async () => {
    const provider = aiProvider();
    const store = makeStore({ aiRecommendationProvider: provider });
    store.commands.setAiRecommendationPrompt('recommend one book');

    await store.commands.requestAiRecommendations();

    expect(provider.recommend).not.toHaveBeenCalled();
    expect(store.selectors.getState().ui.aiStatus.state).toBe('failed');
    expect(store.selectors.getState().ui.aiStatus.message).toBe(
      'Enable the AI provider before requesting recommendations.',
    );
  });

  it('reports missing provider and missing key as separate setup problems', async () => {
    const withoutProvider = makeStore();
    withoutProvider.commands.updateAiLocalSettings({
      enabled: true,
      apiKey: 'local-secret',
    });
    withoutProvider.commands.setAiRecommendationPrompt('recommend one book');
    await withoutProvider.commands.requestAiRecommendations();
    expect(withoutProvider.selectors.getState().ui.aiStatus.message).toContain(
      'host did not provide an AI recommendation provider',
    );

    const provider = aiProvider();
    const withoutKey = makeStore({ aiRecommendationProvider: provider });
    withoutKey.commands.updateAiLocalSettings({ enabled: true, apiKey: '' });
    withoutKey.commands.setAiRecommendationPrompt('recommend one book');
    await withoutKey.commands.requestAiRecommendations();
    expect(provider.recommend).not.toHaveBeenCalled();
    expect(withoutKey.selectors.getState().ui.aiStatus.message).toBe(
      'Add a local AI API key before requesting recommendations.',
    );
  });

  it('preserves prompt whitespace while typing but sends a sanitized request', async () => {
    const provider = aiProvider();
    const store = makeStore({ aiRecommendationProvider: provider });

    store.commands.updateAiLocalSettings({
      enabled: true,
      apiKey: 'local-secret',
    });
    store.commands.setAiRecommendationPrompt(
      'Recommend a book about circuits and embedded systems ',
    );

    expect(store.selectors.getState().ui.aiPrompt).toBe(
      'Recommend a book about circuits and embedded systems ',
    );
    await store.commands.requestAiRecommendations();
    expect(provider.recommend).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Recommend a book about circuits and embedded systems',
      }),
    );
  });

  it('ignores stale recommendation responses after prompt edits', async () => {
    let resolveRecommendation!: (
      response: AiRecommendationProviderResponse,
    ) => void;
    const provider: AiRecommendationProvider = {
      recommend: vi.fn(
        async () =>
          new Promise<AiRecommendationProviderResponse>((resolve) => {
            resolveRecommendation = resolve;
          }),
      ),
    };
    const store = makeStore({ aiRecommendationProvider: provider });

    store.commands.updateAiLocalSettings({
      enabled: true,
      apiKey: 'local-secret',
    });
    store.commands.setAiRecommendationPrompt('first prompt');
    const request = store.commands.requestAiRecommendations();
    expect(store.selectors.getState().ui.aiStatus.state).toBe('loading');

    store.commands.setAiRecommendationPrompt('second prompt');
    resolveRecommendation({
      books: [
        {
          proposalId: 'stale',
          title: 'Stale Proposal',
          authors: [],
          isbn: null,
          pages: 100,
          subjects: ['stale'],
          displayGroup: 'Core',
          manualSeedDifficulty: 5,
          rationale: 'Should not overwrite the edited prompt state.',
          prerequisiteIds: [],
          coStudyIds: [],
        },
      ],
    });
    await request;

    expect(store.selectors.getState().ui.aiProposal).toBeNull();
    expect(store.selectors.getState().ui.aiStatus).toEqual({
      state: 'idle',
      message: 'Prompt changed. Request recommendations again.',
    });
    expect(store.selectors.getState().ui.aiPrompt).toBe('second prompt');
  });
});
