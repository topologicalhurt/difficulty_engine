import { describe, expect, it } from 'vitest';

import { selectAiRecommendationViewModel } from '../../src/app/selectors/ai-recommendations';
import { makeStore } from './store-test-utils';

describe('AI recommendation view model', () => {
  it('projects provider registry models and API key status', () => {
    const store = makeStore();
    store.commands.updateAiLocalSettings({
      enabled: true,
      apiKey: 'local-secret',
    });

    const state = store.selectors.getState();
    const viewModel = selectAiRecommendationViewModel({
      ...state,
      ui: {
        ...state.ui,
        aiConnection: {
          ...state.ui.aiConnection,
          model: 'claude-op',
        },
      },
    });

    expect(viewModel.modelOptions).toContain('gpt-5.5');
    expect(viewModel.modelOptions).toContain('gpt-5-mini');
    expect(viewModel.modelOptions).toContain('claude-sonnet-4-6');
    expect(viewModel.apiKeyIndicator).toBe(
      'API key loaded for this session.',
    );
    expect(viewModel.modelSuggestion).toBe('claude-opus-4-7');
  });
});
