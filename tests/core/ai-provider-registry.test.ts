import { describe, expect, it } from 'vitest';

import {
  bestAiModelMatch,
  defaultAiModel,
  rankedAiModelMatches,
  resolveAiModelInput,
} from '../../src/core/ai-provider-registry';

describe('AI provider registry', () => {
  it('uses cost-first provider defaults', () => {
    expect(defaultAiModel('openai')).toBe('gpt-5-mini');
    expect(defaultAiModel('anthropic')).toBe('claude-haiku-4-5');
  });

  it('maps common model aliases to maintained ids and providers', () => {
    expect(resolveAiModelInput('Claude-sonnet', 'openai')).toMatchObject({
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      confidence: 'alias',
    });
    expect(resolveAiModelInput('gpt latest', 'anthropic')).toMatchObject({
      provider: 'openai',
      model: 'gpt-5.2',
      confidence: 'alias',
    });
  });

  it('ranks fuzzy model matches across providers', () => {
    expect(bestAiModelMatch('claude sonnet')?.model).toBe(
      'claude-sonnet-4-6',
    );
    expect(rankedAiModelMatches('gpt-').map((item) => item.model)).toContain(
      'gpt-5-mini',
    );
  });
});
