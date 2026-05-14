import type { CorpusBook, CorpusSnapshot, TopicIndex } from './internal-types';
import { effectiveReadingPagesById } from './effective-pages';
import { localTitleCueById } from './local-title-cues';
import type { PlannerProjectV1 } from './types';
import { clamp, mean, round2, safeNumber } from './utils';

const NEUTRAL_MANUAL_SEED = 5;
const MANUAL_SEED_BLEND_WEIGHT = 0.65;
const CORPUS_SEED_BLEND_WEIGHT = 1 - MANUAL_SEED_BLEND_WEIGHT;
const NEUTRAL_SEED_EPSILON = 0.05;
const CHAPTER_CONFIDENCE_NORMALIZER = 10;
const TOPIC_STRUCTURE_WEIGHT = 0.35;
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
  const structuralEntryCount =
    book.chapterProfiles.length +
    book.topicProfiles.length * TOPIC_STRUCTURE_WEIGHT;
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
    structuralEntryCount / CHAPTER_CONFIDENCE_NORMALIZER,
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
    ...book.topicProfiles.map((topic) => topic.title),
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
  project: PlannerProjectV1,
): Record<string, DifficultyEvidence> {
  const effectivePages = effectiveReadingPagesById(project);
  const effectiveMedianPages = (() => {
    const values = corpus.books
      .map((book) => effectivePages[book.id]?.effectivePages ?? book.pages)
      .sort((left, right) => left - right);
    const mid = Math.floor(values.length / 2);
    return values.length
      ? values.length % 2
        ? values[mid] || corpus.pageMedian
        : ((values[mid - 1] || corpus.pageMedian) +
            (values[mid] || corpus.pageMedian)) /
          2
      : corpus.pageMedian;
  })();
  const titleCues = localTitleCueById(corpus, topicIndex);
  return Object.fromEntries(
    corpus.books.map((book) => {
      const stats = topicIndex.bookStats[book.id] || {
        baseComplexity: book.seedEstimate,
        weightedRarity: 0,
        topicCount: 0,
        lexicalDensity: book.lexicalDensity,
      };
      const seed = effectiveSeed(book);
      const readingPages = effectivePages[book.id];
      const pageCount = readingPages?.effectivePages ?? book.pages;
      const structuralEntryCount =
        book.chapterProfiles.length +
        book.topicProfiles.length * TOPIC_STRUCTURE_WEIGHT;
      const pageBurden = clamp(
        5 + Math.log2(pageCount / Math.max(1, effectiveMedianPages)) * 1.25,
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
        4 + Math.min(1, structuralEntryCount / 18) * 1.4,
        1,
        10,
      );
      const metadata = difficultyEvidenceMetadataConfidence(
        book,
        stats.topicCount,
      );
      const titleCue = titleCues[book.id] || {
        lift: 0,
        confidence: 0,
        reason: 'No local title cue.',
      };
      const signals = [
        signal('seed', 'Seed estimate', seed, 0.75, 'Manual/enriched seed anchors the model.'),
        signal(
          'local_title_cue',
          'Local title cue',
          5 + titleCue.lift,
          titleCue.confidence,
          titleCue.reason,
        ),
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
          readingPages?.skippedPages
            ? `Effective reading pages (${readingPages.effectivePages}/${readingPages.physicalPages}) drive workload after learned non-core sections are skipped.`
            : 'Longer books raise workload relative to this library median.',
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
          'Chapter/topic structure',
          chapterStructure,
          Math.min(1, structuralEntryCount / CHAPTER_CONFIDENCE_NORMALIZER),
          'TOC chapter and topic evidence improves confidence and workload shape.',
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
      const mandatoryReasons = [
        readingPages?.skippedPages
          ? `Page burden: Effective reading pages (${readingPages.effectivePages}/${readingPages.physicalPages}) drive workload after learned non-core sections are skipped.`
          : null,
        titleCue.reason.includes('ignored globally') ||
        titleCue.reason.includes('same-topic comparator')
          ? `Local title cue: ${titleCue.reason}`
          : null,
      ].filter((reason): reason is string => Boolean(reason));
      const topReasons = [...signals]
        .sort(
          (left, right) =>
            right.value * right.confidence - left.value * left.confidence ||
            left.key.localeCompare(right.key),
        )
        .slice(0, 4)
        .map((entry) => `${entry.label}: ${entry.reason}`);
      const reasons = Array.from(new Set([...mandatoryReasons, ...topReasons]));
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
