import { describe, expect, it, vi } from 'vitest';

import { createDefaultAiConnectionSettings } from '../../src/core/defaults';
import type { AiRecommendationRequest } from '../../src/core/types';
import { createAiRecommendationClient } from '../../src/infra/ai-recommendation-client';
import { silentLogger } from '../app/store-test-utils';

function request(
  provider: AiRecommendationRequest['provider'],
): AiRecommendationRequest {
  return {
    prompt: 'recommend one book',
    provider,
    model: provider === 'anthropic' ? 'claude-test' : 'gpt-test',
    connection: {
      ...createDefaultAiConnectionSettings(),
      enabled: true,
      provider,
      apiKey: 'secret',
      model: provider === 'anthropic' ? 'claude-test' : 'gpt-test',
    },
    maxSuggestions: 1,
    context: {
      books: [],
      relations: [],
      constraints: {
        parallel: 3,
        hoursPerDay: 2,
        minPages: 5,
        maxPages: 20,
        scheduleAlgorithm: 'balanced',
        prerequisiteMode: 'strict',
        bookOrderPolicy: 'auto',
      },
      diagnostics: { warns: [], fails: [] },
    },
  };
}

describe('AI recommendation client', () => {
  it('calls OpenAI Responses API shape and parses JSON text', async () => {
    const fetchImpl = vi.fn(
      async (_url: Parameters<typeof fetch>[0], _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              summary: 'ok',
              books: [{ title: 'Book A' }],
              warnings: [],
            }),
          }),
        ),
    );
    const client = createAiRecommendationClient({
      fetchImpl,
      logger: silentLogger,
    });

    const result = await client.recommend(request('openai'));

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.openai.com/v1/responses',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer secret' }),
      }),
    );
    expect(
      JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)),
    ).not.toHaveProperty('max_output_tokens');
    expect(result.books).toEqual([{ title: 'Book A' }]);
  });

  it('parses nested OpenAI output content and chat-completions shaped overrides', async () => {
    const nestedFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output: [
              {
                content: [
                  {
                    type: 'output_text',
                    text: JSON.stringify({
                      summary: 'ok',
                      books: [{ title: 'Nested Book' }],
                      warnings: [],
                    }),
                  },
                ],
              },
            ],
          }),
        ),
    );
    const nestedClient = createAiRecommendationClient({
      fetchImpl: nestedFetch,
      logger: silentLogger,
    });
    await expect(nestedClient.recommend(request('openai'))).resolves.toEqual(
      expect.objectContaining({ books: [{ title: 'Nested Book' }] }),
    );

    const chatFetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: 'ok',
                    books: [{ title: 'Chat Book' }],
                    warnings: [],
                  }),
                },
              },
            ],
          }),
        ),
    );
    const chatClient = createAiRecommendationClient({
      fetchImpl: chatFetch,
      logger: silentLogger,
    });
    await expect(chatClient.recommend(request('openai'))).resolves.toEqual(
      expect.objectContaining({ books: [{ title: 'Chat Book' }] }),
    );
  });

  it('calls Anthropic Messages API shape and parses JSON text content', async () => {
    const fetchImpl = vi.fn(
      async (_url: Parameters<typeof fetch>[0], _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  summary: 'ok',
                  books: [{ title: 'Book B' }],
                  warnings: [],
                }),
              },
            ],
          }),
        ),
    );
    const client = createAiRecommendationClient({
      fetchImpl,
      logger: silentLogger,
    });

    const result = await client.recommend(request('anthropic'));

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'secret',
          'anthropic-version': '2023-06-01',
        }),
      }),
    );
    expect(
      JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)),
    ).toMatchObject({ max_tokens: 4096 });
    expect(result.books).toEqual([{ title: 'Book B' }]);
  });

  it('sends provider token caps only when explicitly configured', async () => {
    const fetchImpl = vi.fn(
      async (_url: Parameters<typeof fetch>[0], _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              summary: 'ok',
              books: [],
              warnings: [],
            }),
          }),
        ),
    );
    const client = createAiRecommendationClient({
      fetchImpl,
      logger: silentLogger,
    });
    const capped = request('openai');
    capped.connection.maxOutputTokens = 4096;

    await client.recommend(capped);

    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toMatchObject(
      { max_output_tokens: 4096 },
    );
  });

  it('reports empty HTTP responses without leaking JSON.parse errors', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 200 }));
    const client = createAiRecommendationClient({
      fetchImpl,
      logger: silentLogger,
    });

    await expect(client.recommend(request('openai'))).rejects.toThrow(
      'AI provider returned an empty HTTP response.',
    );
  });

  it('reports empty model text separately from HTTP JSON parsing', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: 'incomplete',
            incomplete_details: { reason: 'max_output_tokens' },
            output_text: '',
          }),
        ),
    );
    const client = createAiRecommendationClient({
      fetchImpl,
      logger: silentLogger,
    });

    await expect(client.recommend(request('openai'))).rejects.toThrow(
      'AI provider returned no recommendation text. Response keys: status, incomplete_details, output_text. status: incomplete. incomplete reason: max_output_tokens.',
    );
  });

  it('includes provider error details when HTTP fails', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { message: 'bad key' },
          }),
          { status: 401 },
        ),
    );
    const client = createAiRecommendationClient({
      fetchImpl,
      logger: silentLogger,
    });

    await expect(client.recommend(request('openai'))).rejects.toThrow(
      'AI provider HTTP 401: bad key',
    );
  });

  it('rejects unsafe custom endpoints before sending the API key', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('should not fetch');
    });
    const client = createAiRecommendationClient({
      fetchImpl,
      logger: silentLogger,
    });
    const unsafeRequest = request('openai');
    unsafeRequest.connection.endpointUrl = 'http://example.com/proxy';

    await expect(client.recommend(unsafeRequest)).rejects.toThrow(
      'Custom AI endpoint must use HTTPS, or HTTP on localhost for a local proxy.',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
