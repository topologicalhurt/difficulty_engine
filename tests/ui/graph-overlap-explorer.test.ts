// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import type { GraphRenderModel } from '../../src/app/selectors/graph-render-data';
import { renderHypergraphSvg } from '../../src/ui/graph-hypergraph-panel';

function model(): GraphRenderModel {
  const books = [
    {
      id: 'electronics',
      title: 'Practical Electronics',
      short: 'Electronics',
      displayGroup: 'Applied',
      dep: 1,
    },
    {
      id: 'circuits',
      title: 'Circuit Analysis',
      short: 'Circuits',
      displayGroup: 'Core',
      dep: 1,
    },
  ];
  return {
    visibleIds: books.map((book) => book.id),
    nodes: books,
    books: books.map((book) => ({
      ...book,
      authors: [],
      manualSeedDifficulty: 5,
      pages: 100,
      subjects: [],
      publisher: '',
      isbn: null,
      year: null,
      manualPrereqs: [],
      manualCoStudy: [],
      owned: true,
      planOrder: 0,
      allowPrereqOverlap: false,
      lockDiff: false,
      noPropOut: false,
      ignored: false,
      constantRD: false,
      completed: false,
      enrichment: { chapters: [], description: '', olSubjects: [], tocSource: 'none' },
    })),
    prerequisiteEdges: [],
    coStudyEdges: [],
    referenceEdges: [],
    coStudyGroups: [],
    displayGroupPartitions: [],
    overlapClusters: [],
    overlapExplorer: {
      bookRows: books,
      emptyStateReason: null,
      clusters: [
        {
          id: 'cluster-circuits',
          label: 'circuits, filters',
          topicLabels: ['circuits', 'filters'],
          bookIds: ['electronics', 'circuits'],
          overlapScore: 4,
          timeSaved: 90,
          confidence: 0.82,
        },
      ],
    },
    researchChains: [],
  };
}

describe('topic overlap explorer', () => {
  it('renders topic labels and book participation instead of opaque hubs', () => {
    const svg = renderHypergraphSvg(model());

    expect(svg?.textContent).toContain('Topic overlap explorer');
    expect(svg?.textContent).toContain('circuits, filters');
    expect(svg?.textContent).not.toContain('O1');
  });
});
