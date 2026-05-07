import {
  createDefaultAiConnectionSettings,
  createDefaultAiRecommendationSettings,
} from './defaults';
import { defaultAiModel } from './ai-provider-registry';
import type {
  AiConnectionSettings,
  AiRecommendationProviderKey,
  AiRecommendationSettings,
} from './types';
import {
  normalizeBoolean,
  normalizeNumber,
  normalizeString,
} from './project-normalize-primitives';

function normalizeProvider(value: unknown): AiRecommendationProviderKey {
  return value === 'anthropic' ? 'anthropic' : 'openai';
}

export function normalizeAiConnectionSettings(
  value: unknown,
): AiConnectionSettings {
  const defaults = createDefaultAiConnectionSettings();
  const raw =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const provider = normalizeProvider(raw.provider);
  const modelDefault = defaultAiModel(provider);
  return {
    enabled:
      raw.enabled == null ? defaults.enabled : normalizeBoolean(raw.enabled),
    provider,
    model: normalizeString(raw.model, modelDefault) || modelDefault,
    endpointUrl: normalizeString(raw.endpointUrl),
    apiKey: normalizeString(raw.apiKey),
    timeoutMs: normalizeNumber(
      raw.timeoutMs,
      defaults.timeoutMs,
      1000,
      120000,
      true,
    ),
    maxOutputTokens: normalizeNumber(
      raw.maxOutputTokens,
      defaults.maxOutputTokens,
      256,
      8000,
      true,
    ),
  };
}

export function normalizeAiRecommendationSettings(
  value: unknown,
): AiRecommendationSettings {
  const defaults = createDefaultAiRecommendationSettings();
  const raw =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  return {
    maxSuggestions: normalizeNumber(
      raw.maxSuggestions,
      defaults.maxSuggestions,
      1,
      8,
      true,
    ),
    includeExistingContext:
      raw.includeExistingContext == null
        ? defaults.includeExistingContext
        : normalizeBoolean(raw.includeExistingContext),
  };
}
