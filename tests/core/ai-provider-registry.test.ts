import { describe, expect, it } from 'vitest';

import {
  defaultAiModel,
  resolveAiModelInput,
} from '../../src/core/ai-provider-registry';

describe('AI provider registry', () => {
  it('uses cost-first provider defaults', () => {
    expect(defaultAiModel('openai')).toBe('gpt-5-mini');
    expect(defaultAiModel('anthropic')).toBe('claude-sonnet-4-6');
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
});
