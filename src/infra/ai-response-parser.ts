import type {
  AiClarificationProviderResponse,
  AiRecommendationProviderResponse,
  AiRelationshipProviderResponse,
} from '../core/types';

export interface OpenAiResponse {
  output_text?: string;
  status?: string;
  incomplete_details?: { reason?: string };
  output?: Array<{
    content?: Array<{ type?: string; text?: string; refusal?: string }>;
    text?: string;
  }>;
  choices?: Array<{
    message?: { content?: string | Array<{ type?: string; text?: string }> };
    text?: string;
  }>;
}

export interface AnthropicResponse {
  content?: Array<{ type?: string; text?: string } | string>;
  completion?: string;
  stop_reason?: string;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function extractJsonText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{')) return trimmed;
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

function parseRecommendationJson(
  text: string,
): AiRecommendationProviderResponse {
  const jsonText = extractJsonText(text);
  if (!jsonText.trim()) {
    throw new Error('AI provider returned an empty recommendation body.');
  }
  try {
    const parsed = JSON.parse(jsonText) as AiRecommendationProviderResponse;
    return {
      summary: parsed.summary,
      books: parsed.books,
      removeBookIds: parsed.removeBookIds,
      bookOrder: parsed.bookOrder,
      projectSettings: parsed.projectSettings,
      warnings: parsed.warnings,
    };
  } catch {
    throw new Error(
      'AI provider returned text that was not valid recommendation JSON.',
    );
  }
}

function parseRelationshipJson(text: string): AiRelationshipProviderResponse {
  const jsonText = extractJsonText(text);
  if (!jsonText.trim()) {
    throw new Error('AI provider returned an empty relationship body.');
  }
  try {
    const parsed = JSON.parse(jsonText) as AiRelationshipProviderResponse;
    return {
      summary: parsed.summary,
      stages: parsed.stages,
      relations: parsed.relations,
      warnings: parsed.warnings,
    };
  } catch {
    throw new Error(
      'AI provider returned text that was not valid relationship JSON.',
    );
  }
}

function parseClarificationJson(text: string): AiClarificationProviderResponse {
  const jsonText = extractJsonText(text);
  if (!jsonText.trim()) {
    throw new Error('AI provider returned an empty clarification body.');
  }
  try {
    const parsed = JSON.parse(jsonText) as AiClarificationProviderResponse;
    return {
      question: parsed.question,
      questions: parsed.questions,
      ready: parsed.ready,
      refinedPrompt: parsed.refinedPrompt,
      warnings: parsed.warnings,
    };
  } catch {
    throw new Error(
      'AI provider returned text that was not valid clarification JSON.',
    );
  }
}

function parseHttpJson(text: string): unknown {
  if (!text.trim()) {
    throw new Error('AI provider returned an empty HTTP response.');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('AI provider returned a non-JSON HTTP response.');
  }
}

function errorDetail(text: string): string {
  if (!text.trim()) return '';
  try {
    const parsed = JSON.parse(text) as {
      error?: { message?: string };
      message?: string;
    };
    return parsed.error?.message || parsed.message || '';
  } catch {
    return text.trim().slice(0, 180);
  }
}

function providerHttpError(response: Response, text: string): Error {
  const detail = errorDetail(text);
  return new Error(
    detail
      ? `AI provider HTTP ${response.status}: ${detail}`
      : `AI provider HTTP ${response.status}`,
  );
}

function textContent(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item) => textContent(item));
  if (!record(value)) return [];
  const direct = [value.text, value.output_text, value.completion].filter(
    (item): item is string => typeof item === 'string',
  );
  return [
    ...direct,
    ...textContent(value.content),
    ...textContent(value.message),
    ...textContent(value.choices),
    ...textContent(value.output),
  ];
}

function responseShape(value: unknown): string {
  if (!record(value)) return ` response type: ${typeof value}.`;
  const keys = Object.keys(value).slice(0, 8).join(', ') || 'none';
  const status =
    typeof value.status === 'string' ? ` status: ${value.status}.` : '';
  const stopReason =
    typeof value.stop_reason === 'string'
      ? ` stop reason: ${value.stop_reason}.`
      : '';
  const incompleteReason =
    record(value.incomplete_details) &&
    typeof value.incomplete_details.reason === 'string'
      ? ` incomplete reason: ${value.incomplete_details.reason}.`
      : '';
  return ` Response keys: ${keys}.${status}${stopReason}${incompleteReason}`;
}

function parseProviderText(
  text: string,
  response: unknown,
): AiRecommendationProviderResponse {
  if (!text.trim()) {
    throw new Error(
      `AI provider returned no recommendation text.${responseShape(response)}`,
    );
  }
  return parseRecommendationJson(text);
}

function parseProviderRelationshipText(
  text: string,
  response: unknown,
): AiRelationshipProviderResponse {
  if (!text.trim()) {
    throw new Error(
      `AI provider returned no relationship text.${responseShape(response)}`,
    );
  }
  return parseRelationshipJson(text);
}

function parseProviderClarificationText(
  text: string,
  response: unknown,
): AiClarificationProviderResponse {
  if (!text.trim()) {
    throw new Error(
      `AI provider returned no clarification text.${responseShape(response)}`,
    );
  }
  return parseClarificationJson(text);
}

export async function parseAiHttpResponse(
  response: Response,
): Promise<unknown> {
  const text = await response.text();
  if (!response.ok) {
    throw providerHttpError(response, text);
  }
  return parseHttpJson(text);
}

export function parseOpenAiRecommendation(
  response: OpenAiResponse,
): AiRecommendationProviderResponse {
  return parseProviderText(textContent(response).join('\n'), response);
}

export function parseAnthropicRecommendation(
  response: AnthropicResponse,
): AiRecommendationProviderResponse {
  return parseProviderText(textContent(response).join('\n'), response);
}

export function parseOpenAiRelationship(
  response: OpenAiResponse,
): AiRelationshipProviderResponse {
  return parseProviderRelationshipText(textContent(response).join('\n'), response);
}

export function parseAnthropicRelationship(
  response: AnthropicResponse,
): AiRelationshipProviderResponse {
  return parseProviderRelationshipText(textContent(response).join('\n'), response);
}

export function parseOpenAiClarification(
  response: OpenAiResponse,
): AiClarificationProviderResponse {
  return parseProviderClarificationText(textContent(response).join('\n'), response);
}

export function parseAnthropicClarification(
  response: AnthropicResponse,
): AiClarificationProviderResponse {
  return parseProviderClarificationText(textContent(response).join('\n'), response);
}
