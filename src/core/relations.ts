import type {
  CorpusSnapshot,
  PairSignal,
  RelationInfo,
  TopicIndex,
} from './internal-types';
import type { PlannerProjectV1, RelationEvidence } from './types';
import { learnedRelationCandidates } from './relation-candidates';
import { hasDirectedPath, relationPairKey } from './relation-graph-utils';
import {
  manualAllowOverlapRelation,
  manualBlockRelation,
  manualCoStudyRelation,
  manualPrerequisiteRelation,
} from './relation-manual';
import { mean, round2 } from './utils';

export function inferRelations(
  corpus: CorpusSnapshot,
  topicIndex: TopicIndex,
  _project: PlannerProjectV1,
): RelationInfo {
  const books = corpus.books;
  const byPair: Record<string, PairSignal> = {};
  const relations: RelationEvidence[] = [];
  const prereqById: Record<string, string[]> = {};
  const coStudyPairs: Array<[string, string]> = [];
  const manualAllowOverlap: Record<string, boolean> = {};
  const graph: Record<string, string[]> = {};

  const addRelation = (relation: RelationEvidence): void => {
    if (relation.type === 'prerequisite') {
      if (!prereqById[relation.to]) prereqById[relation.to] = [];
      if (!prereqById[relation.to].includes(relation.from))
        prereqById[relation.to].push(relation.from);
      if (!graph[relation.from]) graph[relation.from] = [];
      if (!graph[relation.from].includes(relation.to))
        graph[relation.from].push(relation.to);
    }
    if (relation.type === 'co-study') {
      coStudyPairs.push([relation.from, relation.to]);
    }
    relations.push(relation);
  };

  function addManualBlock(
    from: string,
    to: string,
    explanation: string,
    reason: string,
  ): void {
    relations.push(manualBlockRelation(from, to, explanation, reason));
  }

  function tryAddPrerequisite(
    relation: RelationEvidence,
    blockReason?: string,
  ): boolean {
    if (
      relations.some(
        (entry) =>
          entry.type === 'prerequisite' &&
          entry.from === relation.from &&
          entry.to === relation.to,
      )
    ) {
      return false;
    }
    if (hasDirectedPath(graph, relation.to, relation.from)) {
      if (blockReason) {
        addManualBlock(
          relation.from,
          relation.to,
          `${relation.from} -> ${relation.to} was ignored because it would create a prerequisite cycle.`,
          blockReason,
        );
      }
      return false;
    }
    addRelation(relation);
    return true;
  }

  books.forEach((book) => {
    prereqById[book.id] = [];
    graph[book.id] = [];
    if (book.allowPrereqOverlap) {
      manualAllowOverlap[book.id] = true;
      addRelation(manualAllowOverlapRelation(book));
    }
  });

  books.forEach((book) => {
    book.manualPrereqs.forEach((parent) => {
      if (!corpus.byId[parent] || parent === book.id) return;
      tryAddPrerequisite(
        manualPrerequisiteRelation(parent, book.id),
        'manual prerequisite cycle',
      );
    });
  });

  const candidates: RelationEvidence[] = [];
  const seenMutual = new Set<string>();
  books.forEach((book) => {
    book.manualCoStudy.forEach((other) => {
      if (!corpus.byId[other] || other === book.id) return;
      const key = relationPairKey(book.id, other);
      if (seenMutual.has(key)) return;
      seenMutual.add(key);
      candidates.push(manualCoStudyRelation(book.id, other));
    });
  });

  const learned = learnedRelationCandidates(corpus, topicIndex);
  Object.assign(byPair, learned.byPair);
  candidates.push(...learned.candidates);

  candidates
    .filter((candidate) => candidate.type === 'prerequisite')
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.from.localeCompare(right.from) ||
        left.to.localeCompare(right.to),
    )
    .forEach((candidate) => {
      tryAddPrerequisite(candidate);
    });

  const pairTaken = new Set(
    relations
      .filter(
        (relation) =>
          relation.type === 'prerequisite' || relation.type === 'co-study',
      )
      .map((relation) => relationPairKey(relation.from, relation.to)),
  );

  candidates
    .filter((candidate) => candidate.type !== 'prerequisite')
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.from.localeCompare(right.from) ||
        left.to.localeCompare(right.to) ||
        left.type.localeCompare(right.type),
    )
    .forEach((candidate) => {
      if (
        candidate.type === 'co-study' &&
        (hasDirectedPath(graph, candidate.from, candidate.to) ||
          hasDirectedPath(graph, candidate.to, candidate.from))
      ) {
        if (candidate.sources.includes('manual')) {
          addManualBlock(
            candidate.from,
            candidate.to,
            `${candidate.from} <-> ${candidate.to} co-study was ignored because the books already have a prerequisite dependency.`,
            'manual co-study conflicts with prerequisite order',
          );
        }
        return;
      }
      const key = relationPairKey(candidate.from, candidate.to);
      if (pairTaken.has(key)) {
        if (
          candidate.sources.includes('manual') &&
          candidate.type === 'co-study'
        ) {
          addManualBlock(
            candidate.from,
            candidate.to,
            `${candidate.from} <-> ${candidate.to} co-study was ignored because that pair already has a stronger graph constraint.`,
            'manual co-study conflicts with existing graph relation',
          );
        }
        return;
      }
      pairTaken.add(key);
      addRelation(candidate);
    });

  return {
    relations,
    prereqById,
    coStudyPairs,
    byPair,
    confidence: round2(
      mean(
        relations
          .filter((relation) => relation.type === 'prerequisite')
          .map((relation) => relation.confidence || relation.score || 0),
      ),
    ),
    manualAllowOverlap,
  };
}
