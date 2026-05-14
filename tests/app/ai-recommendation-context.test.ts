import { describe, expect, it } from 'vitest';

import { buildAiRecommendationContext } from '../../src/app/ai-recommendation-context';
import { makeBook, makeProject, makeStore } from './store-test-utils';

describe('AI recommendation context', () => {
  it('includes complete non-secret planner context without fixed count ceilings', () => {
    const books = Object.fromEntries(
      Array.from({ length: 90 }, (_unused, index) => {
        const id = `book-${index + 1}`;
        return [
          id,
          makeBook({
            id,
            title: `Book ${index + 1}`,
            subjects: Array.from(
              { length: 10 },
              (_subject, subjectIndex) => `subject-${index}-${subjectIndex}`,
            ),
            planOrder: index,
            manualPrereqs: index === 1 ? ['book-1'] : [],
            documents:
              index === 0
                ? [
                    {
                      id: 'doc-1',
                      provider: 'qbittorrent',
                      fileName: 'Book 1.pdf',
                      storagePath: '/private/output/data/documents/Book 1.pdf',
                      contentKind: 'pdf',
                      contentType: 'application/pdf',
                      accessBasis: 'user_owned',
                      status: 'complete',
                      matchScore: 0.94,
                      availability: {
                        seeders: 12,
                        peers: 1,
                        progress: 1,
                        state: 'complete',
                      },
                      provenance: {
                        provider: 'qbittorrent',
                        fetchedAt: '2026-01-01T00:00:00.000Z',
                        confidence: 0.9,
                      },
                      createdAt: '2026-01-01T00:00:00.000Z',
                      updatedAt: '2026-01-01T00:00:00.000Z',
                    },
                  ]
                : [],
          }),
        ];
      }),
    );
    const store = makeStore({
      initialProject: makeProject({
        books,
        projectPatch: {
          manualOverrides: {
            schedule: {},
            deferred: {},
            actuals: {
              '2026-01-01': { 'book-1': { pages: 12, minutes: 45 } },
            },
          },
        },
      }),
    });

    const context = buildAiRecommendationContext(store.selectors.getState());

    expect(context.books).toHaveLength(90);
    expect(context.books[0]?.subjects).toHaveLength(10);
    expect(context.books[0]?.progress).toMatchObject({
      actualPages: 12,
      actualMinutes: 45,
    });
    expect(context.books[0]?.effectiveReadingPages).toBeGreaterThan(0);
    expect(context.books[0]?.difficultyEvidence?.length).toBeGreaterThan(0);
    expect(context.planSummary?.peakBooks).toBeGreaterThan(0);
    expect(context.readingScopeSettings?.defaultMode).toBe('skip_non_core');
    expect(context.constraints.learnerProfileMode).toBe('balanced_adaptive');
    expect(context.relations.length).toBeGreaterThan(0);
    const serializedContext = JSON.stringify(context);
    expect(serializedContext).not.toContain('/private/output/data/documents');
    expect(serializedContext).not.toContain('apiKey');
    expect(serializedContext).not.toContain('password');
  }, 15_000);
});
