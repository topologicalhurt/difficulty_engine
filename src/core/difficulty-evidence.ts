import type { CorpusBook, CorpusSnapshot, TopicIndex } from './internal-types';
import type { PlannerProjectV1 } from './types';
import { clamp, mean, round2, safeNumber } from './utils';

const NEUTRAL_MANUAL_SEED = 5;
const MANUAL_SEED_BLEND_WEIGHT = 0.65;
const CORPUS_SEED_BLEND_WEIGHT = 1 - MANUAL_SEED_BLEND_WEIGHT;
const NEUTRAL_SEED_EPSILON = 0.05;
const CHAPTER_CONFIDENCE_NORMALIZER = 10;
const SUBJECT_CONFIDENCE_NORMALIZER = 8;
const DESCRIPTION_WORD_NORMALIZER = 120;
const TOPIC_CONFIDENCE_NORMALIZER = 18;

export interface DifficultyEvidenceSignal {
  key: string;
  label: string;
  value: number;
  confidence: number;
  reason: string;
}

export interface DifficultyEvidence {
  bookId: string;
  seed: number;
  corpusComplexity: number;
  metadataConfidence: number;
  evidenceConfidence: number;
  signals: DifficultyEvidenceSignal[];
  reasons: string[];
}

export function effectiveSeed(book: {
  lockDiff: boolean;
  manualSeedDifficulty: number;
  seedEstimate: number;
}): number {
  const manualSeed = clamp(
    safeNumber(book.manualSeedDifficulty, NEUTRAL_MANUAL_SEED),
    1,
    10,
  );
  const corpusSeed = clamp(safeNumber(book.seedEstimate, manualSeed), 1, 10);
  if (book.lockDiff) return manualSeed;
  if (Math.abs(manualSeed - NEUTRAL_MANUAL_SEED) <= NEUTRAL_SEED_EPSILON) {
    return corpusSeed;
  }
  return clamp(
    manualSeed * MANUAL_SEED_BLEND_WEIGHT +
      corpusSeed * CORPUS_SEED_BLEND_WEIGHT,
    1,
    10,
  );
}

function difficultyEvidenceProvenanceConfidence(book: CorpusBook): number {
  const values = Object.values(book.enrichment.provenance || {})
    .map((entry) => entry?.confidence ?? 0)
    .filter((value) => value > 0);
  return mean(values);
}

function descriptionWords(book: CorpusBook): number {
  return book.enrichment.description.trim().split(/\s+/).filter(Boolean).length;
}

function difficultyEvidenceMetadataConfidence(
  book: CorpusBook,
  topicCount: number,
): number {
  const subjectConfidence = Math.min(
    1,
    book.subjectTexts.length / SUBJECT_CONFIDENCE_NORMALIZER,
  );
  const descriptionConfidence = Math.min(
    1,
    descriptionWords(book) / DESCRIPTION_WORD_NORMALIZER,
  );
  const chapterConfidence = Math.min(
    1,
    book.chapterProfiles.length / CHAPTER_CONFIDENCE_NORMALIZER,
  );
  const topicConfidence = Math.min(1, topicCount / TOPIC_CONFIDENCE_NORMALIZER);
  const documentConfidence =
    book.sourcePath || book.enrichment.tocSource === 'pdf' ? 0.2 : 0;
  return round2(
    clamp(
      0.15 +
        subjectConfidence * 0.18 +
        descriptionConfidence * 0.16 +
        chapterConfidence * 0.22 +
        topicConfidence * 0.2 +
        difficultyEvidenceProvenanceConfidence(book) * 0.16 +
        documentConfidence,
      0.05,
      1,
    ),
  );
}

function exerciseSignal(book: CorpusBook): number {
  const text = [
    book.title,
    book.enrichment.description,
    ...book.subjectTexts,
    ...book.chapterProfiles.map((chapter) => chapter.title),
  ]
    .join(' ')
    .toLowerCase();
  if (/\b(exercises?|problems?|projects?|labs?|workshops?)\b/.test(text)) {
    return 6.2;
  }
  return 5;
}

function signal(
  key: string,
  label: string,
  value: number,
  confidence: number,
  reason: string,
): DifficultyEvidenceSignal {
  return {
    key,
    label,
    value: clamp(value, 1, 10),
    confidence: round2(clamp(confidence, 0, 1)),
    reason,
  };
}

export function buildDifficultyEvidence(
  corpus: CorpusSnapshot,
  topicIndex: TopicIndex,
  _project: PlannerProjectV1,
): Record<string, DifficultyEvidence> {
  return Object.fromEntries(
    corpus.books.map((book) => {
      const stats = topicIndex.bookStats[book.id] || {
        baseComplexity: book.seedEstimate,
        weightedRarity: 0,
        topicCount: 0,
        lexicalDensity: book.lexicalDensity,
      };
      const seed = effectiveSeed(book);
      const pageBurden = clamp(
        5 + Math.log2(book.pages / Math.max(1, corpus.pageMedian)) * 1.25,
        1,
        10,
      );
      const topicDensity = clamp(3 + Math.min(1, stats.topicCount / 24) * 3.8, 1, 10);
      const topicRarity = clamp(3.4 + stats.weightedRarity * 1.2, 1, 10);
      const lexicalTechnicality = clamp(
        3.2 + clamp(stats.lexicalDensity * 18, 0, 1) * 2.8,
        1,
        10,
      );
      const chapterStructure = clamp(
        4 + Math.min(1, book.chapterProfiles.length / 18) * 1.4,
        1,
        10,
      );
      const metadata = difficultyEvidenceMetadataConfidence(
        book,
        stats.topicCount,
      );
      const signals = [
        signal('seed', 'Seed estimate', seed, 0.75, 'Manual/enriched seed anchors the model.'),
        signal(
          'corpus',
          'Corpus complexity',
          stats.baseComplexity || seed,
          metadata,
          'Topic rarity, breadth, and lexical density estimate intrinsic load.',
        ),
        signal(
          'pages',
          'Page burden',
          pageBurden,
          0.8,
          'Longer books raise workload relative to this library median.',
        ),
        signal(
          'topic_density',
          'Topic density',
          topicDensity,
          metadata,
          'More detected topics usually means more element interaction.',
        ),
        signal(
          'topic_rarity',
          'Topic rarity',
          topicRarity,
          metadata,
          'Rare topics are treated as higher workload evidence.',
        ),
        signal(
          'lexical',
          'Technical density',
          lexicalTechnicality,
          metadata,
          'Dense technical vocabulary raises expected workload.',
        ),
        signal(
          'chapters',
          'Chapter structure',
          chapterStructure,
          Math.min(1, book.chapterProfiles.length / CHAPTER_CONFIDENCE_NORMALIZER),
          'TOC/chapter evidence improves confidence and workload shape.',
        ),
        signal(
          'practice',
          'Practice load',
          exerciseSignal(book),
          metadata,
          'Exercises, projects, and labs increase study effort when detected.',
        ),
      ];
      const evidenceConfidence = round2(
        clamp(mean(signals.map((entry) => entry.confidence)) * 0.75 + metadata * 0.25, 0, 1),
      );
      const reasons = signals
        .sort(
          (left, right) =>
            right.value * right.confidence - left.value * left.confidence ||
            left.key.localeCompare(right.key),
        )
        .slice(0, 4)
        .map((entry) => `${entry.label}: ${entry.reason}`);
      return [
        book.id,
        {
          bookId: book.id,
          seed,
          corpusComplexity: stats.baseComplexity || seed,
          metadataConfidence: metadata,
          evidenceConfidence,
          signals,
          reasons,
        },
      ];
    }),
  );
}
