import type {
  AiRecommendationProvider,
  AiRecommendationProviderResponse,
  AiRecommendationRequest,
  Logger,
} from '../core/types';
import {
  parseAiHttpResponse,
  parseAnthropicRecommendation,
  parseOpenAiRecommendation,
  type AnthropicResponse,
  type OpenAiResponse,
} from './ai-response-parser';
import { consoleLogger } from './logger';
import { isLoopbackHost } from './url-security';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_TIMEOUT_MS = 60000;

interface CreateAiRecommendationClientOptions {
  fetchImpl?: typeof fetch;
  logger?: Logger;
}

function withTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  signal?.addEventListener('abort', () => controller.abort(), { once: true });
  controller.signal.addEventListener(
    'abort',
    () => globalThis.clearTimeout(timeout),
    { once: true },
  );
  return controller.signal;
}

function systemPrompt(): string {
  return [
    'Recommend books for a study planner. Return JSON only.',
    'Use this exact shape: {"summary": string, "books": array, "warnings": array}.',
    'Each book must include title, authors, isbn, pages, subjects, displayGroup, manualSeedDifficulty, rationale, prerequisiteIds, coStudyIds.',
    'Use existing book ids for prerequisites when relevant. Use proposal ids for relations among proposed books.',
    'Do not include HTML, markdown fences, or commentary outside JSON.',
  ].join(' ');
}

function requestPayload(request: AiRecommendationRequest): string {
  return JSON.stringify({
    userGoal: request.prompt,
    maxSuggestions: request.maxSuggestions,
    currentPlanner: request.context,
  });
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
    async recommend(
      request: AiRecommendationRequest,
    ): Promise<AiRecommendationProviderResponse> {
      const connection = request.connection;
      if (!connection.enabled || !connection.apiKey) {
        throw new Error('AI provider is not enabled or is missing an API key.');
      }
      const timeoutMs = connection.timeoutMs || DEFAULT_TIMEOUT_MS;
      const signal = withTimeout(request.signal, timeoutMs);
      const input = requestPayload(request);
      try {
        if (connection.provider === 'anthropic') {
          const endpointUrl = safeAiEndpointUrl(
            connection.endpointUrl,
            ANTHROPIC_MESSAGES_URL,
          );
          const response = (await fetchAiJson(fetchImpl, endpointUrl, {
            method: 'POST',
            signal,
            headers: {
              'content-type': 'application/json',
              'x-api-key': connection.apiKey,
              'anthropic-version': ANTHROPIC_VERSION,
            },
            body: JSON.stringify({
              model: connection.model,
              max_tokens: connection.maxOutputTokens,
              system: systemPrompt(),
              messages: [{ role: 'user', content: input }],
            }),
          })) as AnthropicResponse;
          return parseAnthropicRecommendation(response);
        }
        const endpointUrl = safeAiEndpointUrl(
          connection.endpointUrl,
          OPENAI_RESPONSES_URL,
        );
        const response = (await fetchAiJson(fetchImpl, endpointUrl, {
          method: 'POST',
          signal,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${connection.apiKey}`,
          },
          body: JSON.stringify({
            model: connection.model,
            instructions: systemPrompt(),
            input,
            max_output_tokens: connection.maxOutputTokens,
          }),
        })) as OpenAiResponse;
        return parseOpenAiRecommendation(response);
      } catch (error) {
        logger.warn('planner.ai.recommendation-failed', {
          provider: connection.provider,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    },
  };
}
