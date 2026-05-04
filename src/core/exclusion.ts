import { AUTO_RD_CONFIDENCE_THRESHOLD } from './constants';
import { normalizeAutoResearchChainLength } from './constraints';
import type { CorpusSnapshot, DifficultyModelSnapshot, ExclusionState, RelationInfo } from './internal-types';
import type { PlannerProjectV1 } from './types';
import { mean, round2, safeNumber } from './utils';

export function computeExclusionState(
  corpus: CorpusSnapshot,
  relationInfo: RelationInfo,
  difficultyModel: DifficultyModelSnapshot,
  project: PlannerProjectV1,
): ExclusionState {
  const ignoredSet = new Set(corpus.books.filter((book) => book.ignored).map((book) => book.id));
  const manualRDSet = new Set(corpus.books.filter((book) => book.constantRD).map((book) => book.id));
  const rdSet = new Set([...manualRDSet]);
  const chains: ExclusionState['rdChains'] = [];

  if (project.constraints.autoRD) {
    const activeIds = corpus.books
      .map((book) => book.id)
      .filter((id) => !ignoredSet.has(id) && !manualRDSet.has(id) && !(project.constraints.excComp && corpus.byId[id]?.completed));
    const outgoing: Record<string, string[]> = {};
    const incoming: Record<string, string[]> = {};
    activeIds.forEach((id) => {
      outgoing[id] = [];
      incoming[id] = [];
    });

    activeIds.forEach((id) => {
      (relationInfo.prereqById[id] || []).forEach((parent) => {
        if (outgoing[parent] && incoming[id]) {
          outgoing[parent].push(id);
          incoming[id].push(parent);
        }
      });
    });

    const minLength = normalizeAutoResearchChainLength(project.constraints.rdMinChain);
    const minSlope = safeNumber(project.constraints.rdMinSlope, 0.35);
    const visited = new Set<string>();

    function follow(start: string): string[] {
      const chain = [start];
      let current = start;
      while ((outgoing[current] || []).length === 1) {
        const next = outgoing[current][0];
        if (chain.includes(next) || (incoming[next] || []).length !== 1) break;
        chain.push(next);
        current = next;
      }
      return chain;
    }

    activeIds.forEach((id) => {
      if (visited.has(id)) return;
      const chain = follow(id);
      chain.forEach((entry) => visited.add(entry));
      if (chain.length < minLength) return;
      const difficulties = chain.map((entry) => difficultyModel.byId[entry]?.scheduleDifficulty || corpus.byId[entry]?.manualSeedDifficulty || 5);
      const deltas = difficulties.slice(1).map((value, index) => value - difficulties[index]);
      const avgDelta = mean(deltas);
      const lowBranch = chain.slice(1, -1).every((entry) => (incoming[entry] || []).length <= 1 && (outgoing[entry] || []).length <= 1);
      const avgConfidence = mean(
        chain.slice(1).map((entry) => {
          const parent = incoming[entry]?.[0];
          const relation = relationInfo.relations.find(
            (candidate) => candidate.type === 'prerequisite' && candidate.from === parent && candidate.to === entry,
          );
          return relation?.confidence || 0.5;
        }),
      );
      if (lowBranch && avgDelta >= minSlope && avgConfidence < AUTO_RD_CONFIDENCE_THRESHOLD) {
        chains.push({
          ids: chain,
          avgDelta: round2(avgDelta),
          avgConfidence: round2(avgConfidence),
          label: chain.map((entry) => corpus.byId[entry]?.short || entry).join(' -> '),
        });
        chain.forEach((entry) => rdSet.add(entry));
      }
    });
  }

  return {
    ignoredSet,
    rdSet,
    rdChains: chains,
    manualRDIds: [...manualRDSet],
  };
}
