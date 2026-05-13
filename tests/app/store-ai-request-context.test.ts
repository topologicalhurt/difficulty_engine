import { describe, expect, it } from 'vitest';

import {
  aiRequestContextChanged,
  captureAiRequestContext,
} from '../../src/app/store-ai-request-context';
import { makeStore } from './store-test-utils';

describe('AI request context guard', () => {
  it('tracks planner context, provider settings, prompt, and clarifications', () => {
    const store = makeStore();
    store.commands.updateAiLocalSettings({
      enabled: true,
      apiKey: 'local-secret',
      model: 'gpt-test',
    });
    store.commands.setAiRecommendationPrompt('initial goal');
    const captured = captureAiRequestContext(store.selectors.getState(), {
      includePrompt: true,
      includeClarifications: true,
    }).snapshot;

    expect(aiRequestContextChanged(store.selectors.getState(), captured)).toBe(
      false,
    );

    store.commands.setAiRecommendationPrompt('changed goal');
    expect(aiRequestContextChanged(store.selectors.getState(), captured)).toBe(
      true,
    );
  });

  it('does not include local API keys in the tracked digest payload', () => {
    const store = makeStore();
    store.commands.updateAiLocalSettings({
      enabled: true,
      apiKey: 'local-secret',
    });

    const captured = captureAiRequestContext(store.selectors.getState());

    expect(JSON.stringify(captured)).not.toContain('local-secret');
  });
});
