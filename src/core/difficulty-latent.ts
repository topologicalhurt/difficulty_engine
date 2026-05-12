import type { DifficultyEvidence } from './difficulty-evidence';
import { clamp, mean, round2, sum } from './utils';

const SIGNAL_WEIGHTS: Record<string, number> = {
  seed: 0.82,
  corpus: 0.72,
  pages: 0.62,
  topic_density: 0.58,
  topic_rarity: 0.48,
  lexical: 0.52,
  chapters: 0.28,
  practice: 0.34,
};

const SIGNAL_NEUTRAL: Record<string, number> = {
  seed: 5,
  corpus: 5,
  pages: 5,
  topic_density: 4.35,
  topic_rarity: 3.85,
  lexical: 3.85,
  chapters: 4.45,
  practice: 5,
};

export interface LatentWorkloadEstimate {
  latentWorkload: number;
  workloadUncertainty: number;
  evidenceConfidence: number;
  reasons: string[];
}

function signalDisagreement(evidence: DifficultyEvidence): number {
  const values = evidence.signals.map((signal) => signal.value);
  const center = mean(values);
  return mean(values.map((value) => Math.abs(value - center))) / 4.5;
}

export function estimateLatentWorkload(
  evidence: DifficultyEvidence,
): LatentWorkloadEstimate {
  const anchor =
    evidence.signals.find((signal) => signal.key === 'seed')?.value ??
    evidence.seed;
  const deltas = evidence.signals.map((signal) => {
    const confidence = signal.key === 'seed' ? 1 : signal.confidence;
    const weight = (SIGNAL_WEIGHTS[signal.key] || 0.4) * confidence;
    return {
      delta: (signal.value - (SIGNAL_NEUTRAL[signal.key] ?? 5)) * weight,
      weight,
    };
  });
  const nonSeedWeight = Math.max(
    0.01,
    sum(
      deltas
        .filter((_, index) => evidence.signals[index]?.key !== 'seed')
        .map((entry) => entry.weight),
    ),
  );
  const latent =
    anchor * 0.62 +
    5 * 0.38 +
    sum(deltas.map((entry) => entry.delta)) / Math.sqrt(nonSeedWeight + 1);
  const uncertainty = clamp(
    1 - evidence.evidenceConfidence * 0.72 + signalDisagreement(evidence) * 0.28,
    0,
    1,
  );
  return {
    latentWorkload: round2(clamp(latent, 1, 10)),
    workloadUncertainty: round2(uncertainty),
    evidenceConfidence: evidence.evidenceConfidence,
    reasons: evidence.reasons,
  };
}
