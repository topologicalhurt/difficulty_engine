import type {
  AiClarificationRequest,
  AiRecommendationProvider,
  AiRecommendationProviderResponse,
  AiRecommendationRequest,
  AiRelationshipRequest,
  Logger,
} from '../core/types';
import {
  parseAiHttpResponse,
  parseAnthropicClarification,
  parseAnthropicRecommendation,
  parseAnthropicRelationship,
  parseOpenAiClarification,
  parseOpenAiRecommendation,
  parseOpenAiRelationship,
  type AnthropicResponse,
  type OpenAiResponse,
} from './ai-response-parser';
import { consoleLogger } from './logger';
import { isLoopbackHost } from './url-security';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const ANTHROPIC_DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT_MS = 300000;
const CLARIFICATION_TIMEOUT_MS = 180000;
const RELATIONSHIP_TIMEOUT_MS = 420000;

interface CreateAiRecommendationClientOptions {
  fetchImpl?: typeof fetch;
  logger?: Logger;
}

interface TimedSignal {
  signal: AbortSignal;
  didTimeout: () => boolean;
  timeoutMs: number;
}

function withTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): TimedSignal {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  signal?.addEventListener('abort', () => controller.abort(), { once: true });
  controller.signal.addEventListener(
    'abort',
    () => globalThis.clearTimeout(timeout),
    { once: true },
  );
  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    timeoutMs,
  };
}

function effectiveTimeoutMs(
  connectionTimeoutMs: number,
  taskMinimumMs: number,
): number {
  return Math.max(connectionTimeoutMs || DEFAULT_TIMEOUT_MS, taskMinimumMs);
}

function isAbortLike(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === 'AbortError'
  ) || (error instanceof Error && /aborted/i.test(error.message));
}

function aiRequestError(
  error: unknown,
  task: 'clarification' | 'recommendation' | 'relationship',
  timedSignal: TimedSignal,
): Error {
  if (isAbortLike(error)) {
    const seconds = Math.round(timedSignal.timeoutMs / 1000);
    return new Error(
      timedSignal.didTimeout()
        ? `AI ${task} request timed out after ${seconds}s. The prompt/context is large; increase the AI timeout or retry with a faster model.`
        : `AI ${task} request was cancelled before completion.`,
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

function systemPrompt(): string {
  return [
    'Recommend books for a study planner. Return JSON only.',
    'Use this exact shape: {"summary": string, "books": array, "projectSettings": array, "warnings": array}.',
    'Each book must include title, authors, isbn, pages, subjects, displayGroup, manualSeedDifficulty, rationale, prerequisiteIds, coStudyIds.',
    'When deadline, pacing, parallelism, difficulty, or source settings would materially serve the prompt, strongly suggest projectSettings entries with key, currentValue, suggestedValue, confidence, and rationale.',
    'Use existing book ids for prerequisites when relevant. Use proposal ids for relations among proposed books.',
    'Honor the requested recommendation count, work mode, and DAG depth. Ask clarifying questions before final recommendations when the clarification transcript shows unresolved ambiguity.',
    'Do not include HTML, markdown fences, or commentary outside JSON.',
  ].join(' ');
}

function relationshipSystemPrompt(): string {
  return [
    'Reorganize relationships for an existing reading-list planner. Return JSON only.',
    'Use this exact shape: {"summary": string, "stages": array, "relations": array, "warnings": array}.',
    'Each stage must include label, bookIds, and rationale.',
    'Each relation must include from, to, type, confidence, and rationale.',
    'Relation type must be "prerequisite" or "co-study"; use only existing book ids from currentPlanner.books.',
    'Do not recommend new books. Do not include HTML, markdown fences, or commentary outside JSON.',
  ].join(' ');
}

function clarificationSystemPrompt(): string {
  return [
    'Clarify a study-planner request before recommendations. Return JSON only.',
    'Use this exact shape: {"questions": array, "ready": boolean, "refinedPrompt": string|null, "warnings": array}.',
    'Ask a single batched rapid-fire set of 2-6 concise questions when answers would materially change the reading-list or DAG plan.',
    'Each question must be answerable in one short sentence and should cover a different decision axis.',
    'Set ready true only when the request is specific enough to generate the requested deliverable.',
    'Do not recommend books or relationships in this response.',
  ].join(' ');
}

function requestPayload(request: AiRecommendationRequest): string {
  return JSON.stringify({
    userGoal: request.prompt,
    maxSuggestions: request.maxSuggestions,
    recommendationSettings: request.settings,
    aiRuntime: {
      provider: request.provider,
      model: request.model,
      reasoningMode: request.connection.reasoningMode,
    },
    clarificationTranscript: request.clarifications,
    currentPlanner: request.context,
  });
}

function relationshipPayload(request: AiRelationshipRequest): string {
  return JSON.stringify({
    userGoal: request.prompt,
    relationshipWizard: request.wizard,
    recommendationSettings: request.settings,
    aiRuntime: {
      provider: request.provider,
      model: request.model,
      reasoningMode: request.connection.reasoningMode,
    },
    clarificationTranscript: request.clarifications,
    currentPlanner: request.context,
  });
}

function clarificationPayload(request: AiClarificationRequest): string {
  return JSON.stringify({
    userGoal: request.prompt,
    recommendationSettings: request.settings,
    aiRuntime: {
      provider: request.provider,
      model: request.model,
      reasoningMode: request.connection.reasoningMode,
    },
    clarificationTranscript: request.messages,
    currentPlanner: request.context,
  });
}

function withOptionalTokenCap<T extends Record<string, unknown>>(
  body: T,
  maxOutputTokens: number | null,
  field: string,
): T {
  if (maxOutputTokens == null) return body;
  return { ...body, [field]: maxOutputTokens };
}

function withAnthropicTokenCap<T extends Record<string, unknown>>(
  body: T,
  maxOutputTokens: number | null,
): T & { max_tokens: number } {
  return {
    ...body,
    max_tokens: maxOutputTokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
  };
}

function withOpenAiReasoning<T extends Record<string, unknown>>(
  body: T,
  request: AiRecommendationRequest | AiRelationshipRequest | AiClarificationRequest,
): T {
  const mode = request.connection.reasoningMode;
  if (mode === 'provider_default') return body;
  return {
    ...body,
    reasoning: { effort: mode },
  };
}

function safeAiEndpointUrl(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:') return trimmed;
    if (parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname)) {
      return trimmed;
    }
  } catch {
    // Fall through to the explicit error below.
  }
  throw new Error(
    'Custom AI endpoint must use HTTPS, or HTTP on localhost for a local proxy.',
  );
}

async function fetchAiJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<unknown> {
  const response = await fetchImpl(url, init);
  return parseAiHttpResponse(response);
}

export function createAiRecommendationClient(
  options: CreateAiRecommendationClientOptions,
): AiRecommendationProvider {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const logger = options.logger ?? consoleLogger;

  return {
    async clarifyRecommendation(request) {
      const connection = request.connection;
      if (!connection.enabled || !connection.apiKey) {
        throw new Error('AI provider is not enabled or is missing an API key.');
      }
      const timedSignal = withTimeout(
        request.signal,
        effectiveTimeoutMs(connection.timeoutMs, CLARIFICATION_TIMEOUT_MS),
      );
      const input = clarificationPayload(request);
      try {
        if (connection.provider === 'anthropic') {
          const endpointUrl = safeAiEndpointUrl(
            connection.endpointUrl,
            ANTHROPIC_MESSAGES_URL,
          );
          const response = (await fetchAiJson(fetchImpl, endpointUrl, {
            method: 'POST',
            signal: timedSignal.signal,
            headers: {
              'content-type': 'application/json',
              'x-api-key': connection.apiKey,
              'anthropic-version': ANTHROPIC_VERSION,
            },
            body: JSON.stringify(
              withAnthropicTokenCap(
                {
                  model: connection.model,
                  system: clarificationSystemPrompt(),
                  messages: [{ role: 'user', content: input }],
                },
                connection.maxOutputTokens,
              ),
            ),
          })) as AnthropicResponse;
          return parseAnthropicClarification(response);
        }
        const endpointUrl = safeAiEndpointUrl(
          connection.endpointUrl,
          OPENAI_RESPONSES_URL,
        );
        const response = (await fetchAiJson(fetchImpl, endpointUrl, {
          method: 'POST',
          signal: timedSignal.signal,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${connection.apiKey}`,
          },
          body: JSON.stringify(
            withOptionalTokenCap(
              withOpenAiReasoning(
                {
                  model: connection.model,
                  instructions: clarificationSystemPrompt(),
                  input,
                },
                request,
              ),
              connection.maxOutputTokens,
              'max_output_tokens',
            ),
          ),
        })) as OpenAiResponse;
        return parseOpenAiClarification(response);
      } catch (error) {
        const requestError = aiRequestError(error, 'clarification', timedSignal);
        logger.warn('planner.ai.clarification-failed', {
          provider: connection.provider,
          error: requestError.message,
        });
        throw requestError;
      }
    },
    async recommend(
      request: AiRecommendationRequest,
    ): Promise<AiRecommendationProviderResponse> {
      const connection = request.connection;
      if (!connection.enabled || !connection.apiKey) {
        throw new Error('AI provider is not enabled or is missing an API key.');
      }
      const timedSignal = withTimeout(
        request.signal,
        effectiveTimeoutMs(connection.timeoutMs, DEFAULT_TIMEOUT_MS),
      );
      const input = requestPayload(request);
      try {
        if (connection.provider === 'anthropic') {
          const endpointUrl = safeAiEndpointUrl(
            connection.endpointUrl,
            ANTHROPIC_MESSAGES_URL,
          );
          const response = (await fetchAiJson(fetchImpl, endpointUrl, {
            method: 'POST',
            signal: timedSignal.signal,
            headers: {
              'content-type': 'application/json',
              'x-api-key': connection.apiKey,
              'anthropic-version': ANTHROPIC_VERSION,
            },
            body: JSON.stringify(
              withAnthropicTokenCap(
                {
                  model: connection.model,
                  system: systemPrompt(),
                  messages: [{ role: 'user', content: input }],
                },
                connection.maxOutputTokens,
              ),
            ),
          })) as AnthropicResponse;
          return parseAnthropicRecommendation(response);
        }
        const endpointUrl = safeAiEndpointUrl(
          connection.endpointUrl,
          OPENAI_RESPONSES_URL,
        );
        const response = (await fetchAiJson(fetchImpl, endpointUrl, {
          method: 'POST',
          signal: timedSignal.signal,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${connection.apiKey}`,
          },
          body: JSON.stringify(
            withOptionalTokenCap(
              withOpenAiReasoning(
                {
                  model: connection.model,
                  instructions: systemPrompt(),
                  input,
                },
                request,
              ),
              connection.maxOutputTokens,
              'max_output_tokens',
            ),
          ),
        })) as OpenAiResponse;
        return parseOpenAiRecommendation(response);
      } catch (error) {
        const requestError = aiRequestError(error, 'recommendation', timedSignal);
        logger.warn('planner.ai.recommendation-failed', {
          provider: connection.provider,
          error: requestError.message,
        });
        throw requestError;
      }
    },
    async reorganizeRelationships(request) {
      const connection = request.connection;
      if (!connection.enabled || !connection.apiKey) {
        throw new Error('AI provider is not enabled or is missing an API key.');
      }
      const timedSignal = withTimeout(
        request.signal,
        effectiveTimeoutMs(connection.timeoutMs, RELATIONSHIP_TIMEOUT_MS),
      );
      const input = relationshipPayload(request);
      try {
        if (connection.provider === 'anthropic') {
          const endpointUrl = safeAiEndpointUrl(
            connection.endpointUrl,
            ANTHROPIC_MESSAGES_URL,
          );
          const response = (await fetchAiJson(fetchImpl, endpointUrl, {
            method: 'POST',
            signal: timedSignal.signal,
            headers: {
              'content-type': 'application/json',
              'x-api-key': connection.apiKey,
              'anthropic-version': ANTHROPIC_VERSION,
            },
            body: JSON.stringify(
              withAnthropicTokenCap(
                {
                  model: connection.model,
                  system: relationshipSystemPrompt(),
                  messages: [{ role: 'user', content: input }],
                },
                connection.maxOutputTokens,
              ),
            ),
          })) as AnthropicResponse;
          return parseAnthropicRelationship(response);
        }
        const endpointUrl = safeAiEndpointUrl(
          connection.endpointUrl,
          OPENAI_RESPONSES_URL,
        );
        const response = (await fetchAiJson(fetchImpl, endpointUrl, {
          method: 'POST',
          signal: timedSignal.signal,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${connection.apiKey}`,
          },
          body: JSON.stringify(
            withOptionalTokenCap(
              withOpenAiReasoning(
                {
                  model: connection.model,
                  instructions: relationshipSystemPrompt(),
                  input,
                },
                request,
              ),
              connection.maxOutputTokens,
              'max_output_tokens',
            ),
          ),
        })) as OpenAiResponse;
        return parseOpenAiRelationship(response);
      } catch (error) {
        const requestError = aiRequestError(error, 'relationship', timedSignal);
        logger.warn('planner.ai.relationship-failed', {
          provider: connection.provider,
          error: requestError.message,
        });
        throw requestError;
      }
    },
  };
}
