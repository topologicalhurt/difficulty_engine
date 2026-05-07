import { normalizeMatcherText } from './matchers';
import type { AiRecommendationProviderKey } from './types';

const AI_MODEL_MATCH_MIN_LENGTH = 5;

export interface AiModelDefinition {
  id: string;
  label: string;
  costTier: 'low' | 'medium' | 'high';
  aliases: string[];
}

export interface AiProviderDefinition {
  provider: AiRecommendationProviderKey;
  label: string;
  endpointFamily: 'responses' | 'messages';
  defaultModel: string;
  models: AiModelDefinition[];
}

export interface AiModelResolution {
  provider: AiRecommendationProviderKey;
  model: string;
  confidence: 'exact' | 'alias' | 'prefix' | 'none';
}

export const AI_PROVIDER_REGISTRY: readonly AiProviderDefinition[] = [
  {
    provider: 'openai',
    label: 'ChatGPT / OpenAI',
    endpointFamily: 'responses',
    defaultModel: 'gpt-5-mini',
    models: [
      {
        id: 'gpt-5-mini',
        label: 'GPT-5 mini',
        costTier: 'low',
        aliases: ['gpt5mini', 'gpt mini', 'openai mini'],
      },
      {
        id: 'gpt-5.2',
        label: 'GPT-5.2',
        costTier: 'medium',
        aliases: ['gpt52', 'gpt 5.2', 'gpt latest'],
      },
    ],
  },
  {
    provider: 'anthropic',
    label: 'Anthropic / Claude',
    endpointFamily: 'messages',
    defaultModel: 'claude-sonnet-4-6',
    models: [
      {
        id: 'claude-sonnet-4-6',
        label: 'Claude Sonnet 4.6',
        costTier: 'medium',
        aliases: ['claude sonnet', 'sonnet', 'claude-sonnet'],
      },
      {
        id: 'claude-opus-4-7',
        label: 'Claude Opus 4.7',
        costTier: 'high',
        aliases: ['claude opus', 'opus', 'claude-opus'],
      },
      {
        id: 'claude-haiku-4-5',
        label: 'Claude Haiku 4.5',
        costTier: 'low',
        aliases: ['claude haiku', 'haiku', 'claude-haiku'],
      },
    ],
  },
];

function compactModelText(value: string): string {
  return normalizeMatcherText(value).replace(/[^a-z0-9]+/g, '');
}

export function aiProviderDefinition(
  provider: AiRecommendationProviderKey,
): AiProviderDefinition {
  return (
    AI_PROVIDER_REGISTRY.find((definition) => definition.provider === provider) ??
    AI_PROVIDER_REGISTRY[0]
  );
}

export function defaultAiModel(
  provider: AiRecommendationProviderKey,
): string {
  return aiProviderDefinition(provider).defaultModel;
}

export function aiProviderOptions(): Array<{
  value: AiRecommendationProviderKey;
  label: string;
}> {
  return AI_PROVIDER_REGISTRY.map((definition) => ({
    value: definition.provider,
    label: definition.label,
  }));
}

export function aiModelOptions(provider?: AiRecommendationProviderKey): string[] {
  return AI_PROVIDER_REGISTRY.filter(
    (definition) => !provider || definition.provider === provider,
  ).flatMap((definition) => definition.models.map((model) => model.id));
}

export function aiModelBelongsToProvider(
  provider: AiRecommendationProviderKey,
  model: string,
): boolean {
  const compactInput = compactModelText(model);
  return aiProviderDefinition(provider).models.some((candidate) =>
    [candidate.id, ...candidate.aliases].some(
      (alias) => compactModelText(alias) === compactInput,
    ),
  );
}

export function resolveAiModelInput(
  value: string,
  fallbackProvider: AiRecommendationProviderKey,
): AiModelResolution {
  const compactInput = compactModelText(value);
  if (compactInput.length < AI_MODEL_MATCH_MIN_LENGTH) {
    return {
      provider: fallbackProvider,
      model: value,
      confidence: 'none',
    };
  }
  for (const definition of AI_PROVIDER_REGISTRY) {
    for (const model of definition.models) {
      const aliases = [model.id, ...model.aliases];
      if (aliases.some((alias) => compactModelText(alias) === compactInput)) {
        return {
          provider: definition.provider,
          model: model.id,
          confidence: compactModelText(model.id) === compactInput
            ? 'exact'
            : 'alias',
        };
      }
    }
  }
  for (const definition of AI_PROVIDER_REGISTRY) {
    for (const model of definition.models) {
      const aliases = [model.id, ...model.aliases];
      if (
        aliases.some((alias) => compactModelText(alias).startsWith(compactInput))
      ) {
        return {
          provider: definition.provider,
          model: model.id,
          confidence: 'prefix',
        };
      }
    }
  }
  return {
    provider: fallbackProvider,
    model: value,
    confidence: 'none',
  };
}
