import { afterEach, describe, expect, it } from 'vitest';

import { loadRuntimeAiConnectionPatch } from '../../src/infra/runtime-env';
import { publicRuntimeEnvAssignment } from '../../scripts/runtime-env.mjs';

describe('runtime env config', () => {
  afterEach(() => {
    globalThis.__DIFFICULTY_ENGINE_ENV__ = undefined;
  });

  it('returns undefined when no runtime config exists', () => {
    expect(loadRuntimeAiConnectionPatch()).toBeUndefined();
  });

  it('loads an AI key patch without forcing provider defaults', () => {
    globalThis.__DIFFICULTY_ENGINE_ENV__ = {
      ai: { apiKey: 'env-secret' },
    };

    expect(loadRuntimeAiConnectionPatch()).toEqual({
      apiKey: 'env-secret',
      enabled: true,
    });
  });

  it('preserves explicit provider and model values', () => {
    globalThis.__DIFFICULTY_ENGINE_ENV__ = {
      ai: {
        apiKey: 'env-secret',
        provider: 'anthropic',
        model: 'claude-test',
      },
    };

    expect(loadRuntimeAiConnectionPatch()).toEqual({
      apiKey: 'env-secret',
      enabled: true,
      provider: 'anthropic',
      model: 'claude-test',
    });
  });

  it('redacts API keys from public build runtime assignments', () => {
    const assignment = publicRuntimeEnvAssignment({
      ai: {
        apiKey: 'env-secret',
        provider: 'openai',
        model: 'gpt-5-mini',
      },
    });

    expect(assignment).not.toContain('env-secret');
    expect(assignment).not.toContain('apiKey');
    expect(assignment).toContain('gpt-5-mini');
  });
});
