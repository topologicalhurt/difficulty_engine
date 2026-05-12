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
    defaultModel: 'claude-haiku-4-5',
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

function levenshteinDistance(left: string, right: string): number {
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index,
  );
  const current = Array.from({ length: right.length + 1 }, () => 0);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? 0;
}

export function rankedAiModelMatches(
  query: string,
  provider?: AiRecommendationProviderKey,
): Array<{
  provider: AiRecommendationProviderKey;
  model: string;
  label: string;
}> {
  const compactInput = compactModelText(query);
  const candidates = AI_PROVIDER_REGISTRY.filter(
    (definition) => !provider || definition.provider === provider,
  ).flatMap((definition) =>
    definition.models.map((model) => ({
      provider: definition.provider,
      model: model.id,
      label: model.label,
      aliases: model.aliases,
    })),
  );
  if (!compactInput) {
    return candidates.slice(0, 6).map(({ provider, model, label }) => ({
      provider,
      model,
      label,
    }));
  }
  return candidates
    .map((candidate) => {
      const aliases = [
        candidate.model,
        candidate.label,
        ...candidate.aliases,
      ].map(compactModelText);
      const exact = aliases.some((alias) => alias === compactInput);
      const prefix = aliases.some((alias) => alias.startsWith(compactInput));
      const contains = aliases.some((alias) => alias.includes(compactInput));
      const distance = Math.min(
        ...aliases.map((alias) =>
          levenshteinDistance(
            compactInput,
            alias.slice(0, Math.max(compactInput.length, 1)),
          ),
        ),
      );
      let score = distance + 6;
      if (exact) score = 0;
      else if (prefix) score = distance;
      else if (contains) score = distance + 2;
      return { candidate, score };
    })
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.candidate.provider.localeCompare(right.candidate.provider) ||
        left.candidate.model.localeCompare(right.candidate.model),
    )
    .slice(0, 6)
    .map(({ candidate }) => ({
      provider: candidate.provider,
      model: candidate.model,
      label: candidate.label,
    }));
}

export function bestAiModelMatch(
  query: string,
  provider?: AiRecommendationProviderKey,
): ReturnType<typeof rankedAiModelMatches>[number] | null {
  return rankedAiModelMatches(query, provider)[0] ?? null;
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
