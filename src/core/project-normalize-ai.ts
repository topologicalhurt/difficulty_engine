import {
  createDefaultAiConnectionSettings,
  createDefaultAiRecommendationSettings,
} from './defaults';
import { defaultAiModel } from './ai-provider-registry';
import type {
  AiConnectionSettings,
  AiRecommendationProviderKey,
  AiRecommendationSettings,
  AiRecommendationWorkMode,
  AiReasoningMode,
} from './types';
import {
  normalizeBoolean,
  normalizeNumber,
  normalizeString,
} from './project-normalize-primitives';

function normalizeProvider(value: unknown): AiRecommendationProviderKey {
  return value === 'anthropic' ? 'anthropic' : 'openai';
}

function normalizeReasoningMode(value: unknown): AiReasoningMode {
  return value === 'none' ||
    value === 'low' ||
    value === 'medium' ||
    value === 'high' ||
    value === 'xhigh'
    ? value
    : 'provider_default';
}

function normalizeWorkMode(value: unknown): AiRecommendationWorkMode {
  return value === 'new_books' || value === 'plan' || value === 'both'
    ? value
    : 'both';
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
      900000,
      true,
    ),
    maxOutputTokens:
      raw.maxOutputTokens == null || raw.maxOutputTokens === ''
        ? null
        : normalizeNumber(raw.maxOutputTokens, 1800, 256, 200000, true),
    reasoningMode: normalizeReasoningMode(raw.reasoningMode),
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
      20,
      true,
    ),
    dagDepth: normalizeNumber(raw.dagDepth, defaults.dagDepth, 0, 12, true),
    workMode: normalizeWorkMode(raw.workMode),
    includeExistingContext:
      raw.includeExistingContext == null
        ? defaults.includeExistingContext
        : normalizeBoolean(raw.includeExistingContext),
  };
}
