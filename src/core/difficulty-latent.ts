import type { DifficultyEvidence } from './difficulty-evidence';
import { clamp, mean, round2, sum } from './utils';

const SIGNAL_WEIGHTS: Record<string, number> = {
  seed: 2,
  corpus: 1.05,
  pages: 0.65,
  topic_density: 0.75,
  topic_rarity: 0.55,
  lexical: 0.55,
  chapters: 0.3,
  practice: 0.45,
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
  const weightedSignals = evidence.signals.map((signal) => {
    const weight = (SIGNAL_WEIGHTS[signal.key] || 1) * signal.confidence;
    return { value: signal.value, weight };
  });
  const weightTotal = Math.max(0.01, sum(weightedSignals.map((entry) => entry.weight)));
  const latent = sum(
    weightedSignals.map((entry) => entry.value * entry.weight),
  ) / weightTotal;
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
