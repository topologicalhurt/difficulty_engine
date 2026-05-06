import {
  MAX_EXHAUSTIVE_RELATION_BOOKS,
  MAX_INDEXED_RELATION_CANDIDATES_PER_BOOK,
  MAX_RELATION_INDEX_TOPIC_FREQUENCY,
  RELATION_INDEX_TOKEN_PAIR_WEIGHT,
} from './constants';
import type { CorpusSnapshot, TopicIndex } from './internal-types';
import { relationPairKey } from './relation-graph-utils';
import { tokenizeWords } from './text';

export function relationPairIndexes(
  books: CorpusSnapshot['books'],
  topicIndex: TopicIndex,
  requiredPairKeys: Set<string>,
): Array<[number, number]> {
  if (books.length <= MAX_EXHAUSTIVE_RELATION_BOOKS) {
    return exhaustivePairIndexes(books.length);
  }

  const indexById = new Map(books.map((book, index) => [book.id, index]));
  const cappedPairKeys = cappedIndexedPairKeys(
    indexedPairScores(books, topicIndex),
    requiredPairKeys,
  );

  return cappedPairKeys
    .map((key): [number, number] | null =>
      pairKeyToIndexes(key, indexById),
    )
    .filter((pair): pair is [number, number] => Boolean(pair))
    .sort(
      ([leftA, rightA], [leftB, rightB]) =>
        leftA - leftB || rightA - rightB,
    );
}

function exhaustivePairIndexes(bookCount: number): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < bookCount; i += 1) {
    for (let j = i + 1; j < bookCount; j += 1) {
      pairs.push([i, j]);
    }
  }
  return pairs;
}

function indexedPairScores(
  books: CorpusSnapshot['books'],
  topicIndex: TopicIndex,
): Map<string, number> {
  const topicToBookIds = new Map<string, string[]>();
  const topicTokenToBookIds = new Map<string, string[]>();
  books.forEach((book) => {
    (topicIndex.byBook[book.id] ?? []).forEach((topic) => {
      appendBucket(topicToBookIds, topic.phrase, book.id);
      tokenizeWords(topic.phrase).forEach((token) => {
        appendBucket(topicTokenToBookIds, token, book.id);
      });
    });
  });

  const pairScores = new Map<string, number>();
  addIndexedPairScores(pairScores, topicToBookIds, 1);
  addIndexedPairScores(
    pairScores,
    topicTokenToBookIds,
    RELATION_INDEX_TOKEN_PAIR_WEIGHT,
  );
  return pairScores;
}

function appendBucket(
  buckets: Map<string, string[]>,
  key: string,
  bookId: string,
): void {
  const ids = buckets.get(key) ?? [];
  ids.push(bookId);
  buckets.set(key, ids);
}

function pairKeyToIndexes(
  key: string,
  indexById: Map<string, number>,
): [number, number] | null {
  const [leftId, rightId] = key.split('|');
  const leftIndex = indexById.get(leftId);
  const rightIndex = indexById.get(rightId);
  if (leftIndex == null || rightIndex == null || leftIndex === rightIndex) {
    return null;
  }
  return leftIndex < rightIndex
    ? [leftIndex, rightIndex]
    : [rightIndex, leftIndex];
}

function addIndexedPairScores(
  pairScores: Map<string, number>,
  buckets: Map<string, string[]>,
  weight: number,
): void {
  buckets.forEach((ids) => {
    const sortedIds = [...new Set(ids)].sort();
    if (sortedIds.length > MAX_RELATION_INDEX_TOPIC_FREQUENCY) return;
    for (let left = 0; left < sortedIds.length; left += 1) {
      for (let right = left + 1; right < sortedIds.length; right += 1) {
        const key = relationPairKey(sortedIds[left], sortedIds[right]);
        pairScores.set(key, (pairScores.get(key) ?? 0) + weight);
      }
    }
  });
}

function cappedIndexedPairKeys(
  pairScores: Map<string, number>,
  requiredPairKeys: Set<string>,
): string[] {
  const countsByBook = new Map<string, number>();
  const selected = new Set<string>(requiredPairKeys);
  requiredPairKeys.forEach((key) => {
    key.split('|').forEach((id) => {
      countsByBook.set(id, (countsByBook.get(id) ?? 0) + 1);
    });
  });

  [...pairScores.entries()]
    .sort(
      ([leftKey, leftScore], [rightKey, rightScore]) =>
        rightScore - leftScore || leftKey.localeCompare(rightKey),
    )
    .forEach(([key]) => {
      if (selected.has(key)) return;
      const [leftId, rightId] = key.split('|');
      const leftCount = countsByBook.get(leftId) ?? 0;
      const rightCount = countsByBook.get(rightId) ?? 0;
      if (
        leftCount >= MAX_INDEXED_RELATION_CANDIDATES_PER_BOOK ||
        rightCount >= MAX_INDEXED_RELATION_CANDIDATES_PER_BOOK
      ) {
        return;
      }
      selected.add(key);
      countsByBook.set(leftId, leftCount + 1);
      countsByBook.set(rightId, rightCount + 1);
    });

  return [...selected].sort();
}
