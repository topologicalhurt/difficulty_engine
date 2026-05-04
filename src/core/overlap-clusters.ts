import { TOPIC_MATCH_SIMILARITY } from './constants';
import { totalHours } from './constraints';
import { DisjointSet } from './disjoint-set';
import type {
  CorpusSnapshot,
  OverlapCluster,
  RelationInfo,
  TopicIndex,
} from './internal-types';
import { textSimilarity } from './text';
import type { PlannerProjectV1, SchedulePlan } from './types';
import { clamp, round1, round2, safeNumber, unique } from './utils';

const OVERLAP_CLUSTER_THRESHOLD = 0.18;
const FOUNDATION_OVERLAP_PENALTY = 0.18;
const PEER_OVERLAP_PENALTY = 0.58;
const PREREQ_OVERLAP_PENALTY = 1;
const MAX_CLUSTER_TOPIC_IDS = 10;

function topicPhrasesByBook(bookIds: string[], topicIndex: TopicIndex): Record<string, string[]> {
  return Object.fromEntries(
    bookIds.map((id) => [id, (topicIndex.byBook[id] || []).map((topic) => topic.phrase)]),
  );
}

function overlapComponents(
  bookIds: string[],
  relationInfo: RelationInfo,
): Array<{ root: string; ids: string[] }> {
  const components = new DisjointSet(bookIds);
  for (let index = 0; index < bookIds.length; index += 1) {
    for (let next = index + 1; next < bookIds.length; next += 1) {
      const left = bookIds[index];
      const right = bookIds[next];
      const signal = relationInfo.byPair[[left, right].sort().join('|')] || { overlap: 0 };
      if ((signal.overlap || 0) >= OVERLAP_CLUSTER_THRESHOLD) components.union(left, right);
    }
  }
  const grouped: Record<string, string[]> = {};
  bookIds.forEach((id) => {
    const root = components.find(id);
    if (!grouped[root]) grouped[root] = [];
    grouped[root].push(id);
  });
  return Object.entries(grouped)
    .map(([root, ids]) => ({ root, ids }))
    .filter((group) => group.ids.length >= 2);
}

function primaryBookId(
  ids: string[],
  schedulePlan: SchedulePlan,
  relationInfo: RelationInfo,
): string {
  return ids.reduce((best, id) => {
    const current = schedulePlan.byId[id];
    const chosen = schedulePlan.byId[best];
    if (
      (relationInfo.prereqById[id] || []).length !==
      (relationInfo.prereqById[best] || []).length
    ) {
      return (relationInfo.prereqById[id] || []).length <
        (relationInfo.prereqById[best] || []).length
        ? id
        : best;
    }
    if ((current?.ds || 0) !== (chosen?.ds || 0)) {
      return (current?.ds || 0) < (chosen?.ds || 0) ? id : best;
    }
    return (current?.scheduleDifficulty || 0) < (chosen?.scheduleDifficulty || 0) ? id : best;
  }, ids[0]);
}

function overlapPenalty(
  bookId: string,
  primaryId: string,
  relationInfo: RelationInfo,
): number {
  const parentOfChild = (relationInfo.prereqById[bookId] || []).includes(primaryId);
  const childOfParent = (relationInfo.prereqById[primaryId] || []).includes(bookId);
  if (parentOfChild) return PREREQ_OVERLAP_PENALTY;
  if (childOfParent) return FOUNDATION_OVERLAP_PENALTY;
  return PEER_OVERLAP_PENALTY;
}

function overlapReason(
  corpus: CorpusSnapshot,
  bookId: string,
  primaryId: string,
  relationInfo: RelationInfo,
): string {
  const primaryName = corpus.byId[primaryId]?.short || 'anchor';
  const parentOfChild = (relationInfo.prereqById[bookId] || []).includes(primaryId);
  const childOfParent = (relationInfo.prereqById[primaryId] || []).includes(bookId);
  if (parentOfChild) return `later book revisits ${primaryName} material`;
  if (childOfParent) return `earlier foundation should stay mostly intact relative to ${primaryName}`;
  return `shared material with ${primaryName}`;
}

export function buildOverlapClusters(
  corpus: CorpusSnapshot,
  topicIndex: TopicIndex,
  relationInfo: RelationInfo,
  schedulePlan: SchedulePlan,
  project: PlannerProjectV1,
): OverlapCluster[] {
  const bookIds = schedulePlan.items.map((item) => item.id);
  const byBook = topicPhrasesByBook(bookIds, topicIndex);

  return overlapComponents(bookIds, relationInfo).map(({ root, ids }) => {
    ids.sort(
      (left, right) =>
        (schedulePlan.byId[left]?.ds || 0) - (schedulePlan.byId[right]?.ds || 0) ||
        left.localeCompare(right),
    );
    const primaryId = primaryBookId(ids, schedulePlan, relationInfo);
    const primaryTopics = new Set(byBook[primaryId] || []);
    const pruning = ids
      .filter((id) => id !== primaryId)
      .map((id) => {
        const shared = (byBook[id] || []).filter((topic) =>
          [...primaryTopics].some((other) => textSimilarity(topic, other) >= TOPIC_MATCH_SIMILARITY),
        );
        if (!shared.length) return null;
        const signal = relationInfo.byPair[[id, primaryId].sort().join('|')] || { overlap: 0 };
        const overlapFrac = clamp(signal.overlap || 0, 0, 0.92);
        const penalty = overlapPenalty(id, primaryId, relationInfo);
        const diff = schedulePlan.byId[id]?.scheduleDifficulty || 5;
        const timeSaved = round1(
          totalHours(corpus.byId[id]?.pages || 300, diff, project.constraints) *
            overlapFrac *
            (1 - safeNumber(project.constraints.skimRatio, 0.35)) *
            penalty,
        );
        return {
          bookId: id,
          topicIds: shared.slice(0, MAX_CLUSTER_TOPIC_IDS),
          action: 'skim' as const,
          reason: overlapReason(corpus, id, primaryId, relationInfo),
          timeSaved,
          overlapFrac: round2(overlapFrac),
          prereqPenalty: round2(penalty),
          confidence: round2(
            clamp((signal.overlap || 0) * 0.7 + (signal.symmetry || 0) * 0.3, 0, 1),
          ),
        };
      })
      .filter(
        (
          value,
        ): value is {
          bookId: string;
          topicIds: string[];
          action: 'skim';
          reason: string;
          timeSaved: number;
          overlapFrac: number;
          prereqPenalty: number;
          confidence: number;
        } => Boolean(value),
      );

    return {
      id: `cl_${root.slice(0, 12)}`,
      topicIds: unique(ids.flatMap((id) => byBook[id] || [])),
      bookIds: ids,
      primaryBookId: primaryId,
      pruning,
    };
  });
}
