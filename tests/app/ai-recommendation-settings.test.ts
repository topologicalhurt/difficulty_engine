import { describe, expect, it, vi } from 'vitest';

import type {
  AiClarificationRequest,
  AiRecommendationProvider,
} from '../../src/core/types';
import { makeStore } from './store-test-utils';

describe('AI recommendation settings and clarification flow', () => {
  it('persists recommendation count, DAG depth, and work mode in project settings', async () => {
    const provider: AiRecommendationProvider = {
      recommend: vi.fn(async () => ({
        summary: 'ok',
        books: [],
        warnings: [],
      })),
    };
    const store = makeStore({ aiRecommendationProvider: provider });

    store.commands.updateAiLocalSettings({
      enabled: true,
      apiKey: 'local-secret',
    });
    store.commands.updateAiRecommendationSettings({
      maxSuggestions: 9,
      dagDepth: 5,
      workMode: 'new_books',
    });
    store.commands.setAiRecommendationPrompt('recommend next books');
    await store.commands.requestAiRecommendations();

    expect(store.selectors.getProject().aiRecommendationSettings).toMatchObject({
      maxSuggestions: 9,
      dagDepth: 5,
      workMode: 'new_books',
    });
    expect(provider.recommend).toHaveBeenCalledWith(
      expect.objectContaining({
        maxSuggestions: 9,
        settings: expect.objectContaining({
          maxSuggestions: 9,
          dagDepth: 5,
          workMode: 'new_books',
        }),
      }),
    );
  });

  it('supports a dialog-backed clarification round trip before recommendations', async () => {
    const provider: AiRecommendationProvider = {
      recommend: vi.fn(async () => ({ summary: 'ok', books: [], warnings: [] })),
      clarifyRecommendation: vi.fn(async (request: AiClarificationRequest) => ({
        questions: request.messages.length
          ? []
          : [
              'Which topic should be prioritized?',
              'How deadline-sensitive is the plan?',
            ],
        ready: request.messages.length > 0,
        refinedPrompt: request.messages.length
          ? `${request.prompt} Priority: ${
              request.messages.find((message) => message.role === 'user')?.text
            }`
          : null,
        warnings: [],
      })),
    };
    const store = makeStore({ aiRecommendationProvider: provider });

    store.commands.updateAiLocalSettings({
      enabled: true,
      apiKey: 'local-secret',
    });
    store.commands.updateAiRecommendationSettings({ workMode: 'new_books' });
    store.commands.setAiRecommendationPrompt('build a plan');
    await store.commands.requestAiWorkspaceProposal();

    expect(store.selectors.getState().ui.aiClarificationMessages).toEqual([
      { role: 'assistant', text: 'Which topic should be prioritized?' },
      { role: 'assistant', text: 'How deadline-sensitive is the plan?' },
    ]);
    expect(store.selectors.getState().ui.dialog).toMatchObject({
      id: 'ai.clarification',
      body: '2 clarification card(s) are ready.',
    });

    store.commands.setAiClarificationAnswer(0, 'signal processing first');
    store.commands.setAiClarificationAnswer(1, 'soft deadline');
    await store.commands.requestAiWorkspaceProposal();

    expect(store.selectors.getState().ui.aiClarificationStatus.state).toBe(
      'ready',
    );
    expect(provider.recommend).toHaveBeenCalledWith(
      expect.objectContaining({
        clarifications: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            text: expect.stringContaining('signal processing first'),
          }),
        ]),
      }),
    );
  });
});
