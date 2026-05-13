import type { CorpusSnapshot, TopicIndex } from './internal-types';
import { tokenizeWords } from './text';
import { clamp, round2 } from './utils';

function cueSet(values: string[]): Set<string> {
  return new Set(values.flatMap(tokenizeWords));
}

const INTRO_TITLE_CUES = cueSet([
  'beginner',
  'elementary',
  'foundations',
  'intro',
  'introduction',
  'primer',
]);

const ADVANCED_TITLE_CUES = cueSet([
  'advanced',
  'expert',
  'graduate',
  'mastering',
  'specialized',
]);

export interface LocalTitleCue {
  lift: number;
  confidence: number;
  reason: string;
}

function cueScore(title: string): number {
  const tokens = tokenizeWords(title);
  const intro = tokens.some((token) => INTRO_TITLE_CUES.has(token));
  const advanced = tokens.some((token) => ADVANCED_TITLE_CUES.has(token));
  if (intro && !advanced) return -1;
  if (advanced && !intro) return 1;
  return 0;
}

function topicOverlap(
  leftId: string,
  rightId: string,
  topicIndex: TopicIndex,
): number {
  const left = new Set(Object.keys(topicIndex.bookStats[leftId]?.topicWeights ?? {}));
  const right = new Set(Object.keys(topicIndex.bookStats[rightId]?.topicWeights ?? {}));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  left.forEach((topic) => {
    if (right.has(topic)) shared += 1;
  });
  return shared / Math.max(1, Math.min(left.size, right.size));
}

export function localTitleCueById(
  corpus: CorpusSnapshot,
  topicIndex: TopicIndex,
): Record<string, LocalTitleCue> {
  const cues = Object.fromEntries(
    corpus.books.map((book) => [book.id, cueScore(book.title)]),
  );
  return Object.fromEntries(
    corpus.books.map((book) => {
      const cue = cues[book.id] ?? 0;
      if (!cue) {
        return [
          book.id,
          {
            lift: 0,
            confidence: 0,
            reason: 'No local title-level intro/advanced cue.',
          },
        ];
      }
      const comparator = corpus.books
        .filter((other) => other.id !== book.id && (cues[other.id] ?? 0) !== cue)
        .map((other) => ({
          id: other.id,
          overlap: topicOverlap(book.id, other.id, topicIndex),
        }))
        .sort((left, right) => right.overlap - left.overlap)[0];
      if (!comparator || comparator.overlap < 0.34) {
        return [
          book.id,
          {
            lift: 0,
            confidence: 0,
            reason:
              'Title cue was ignored globally because no close same-topic comparator exists.',
          },
        ];
      }
      const confidence = clamp(comparator.overlap, 0.35, 0.85);
      return [
        book.id,
        {
          lift: round2(cue * confidence * 0.55),
          confidence: round2(confidence),
          reason:
            cue < 0
              ? 'Introductory title cue applies only relative to a close same-topic comparator.'
              : 'Advanced title cue applies only relative to a close same-topic comparator.',
        },
      ];
    }),
  );
}
