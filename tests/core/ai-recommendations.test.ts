import { describe, expect, it } from 'vitest';

import { normalizeAiRecommendationProposal } from '../../src/core/ai-recommendations';

type ProposalArgs = Parameters<typeof normalizeAiRecommendationProposal>;

const meta = {
  provider: 'anthropic',
  model: 'test-model',
  prompt: 'p',
  createdAt: '2026-01-01T00:00:00.000Z',
  contextDigest: 'digest',
  maxSuggestions: 10,
} as unknown as ProposalArgs[1];

describe('AI recommendation proposal normalization', () => {
  it('disambiguates duplicate proposalIds across books', () => {
    const response = {
      books: [
        { title: 'Linear Algebra', proposalId: 'la' },
        { title: 'Linear Algebra Volume II', proposalId: 'la' },
        { title: 'Linear Algebra Volume III', proposalId: 'la' },
      ],
    } as unknown as ProposalArgs[0];

    const proposal = normalizeAiRecommendationProposal(response, meta);
    const ids = proposal.books.map((book) => book.proposalId);

    expect(ids).toHaveLength(3);
    // Every book keeps a distinct order anchor.
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe('la');
  });
});
