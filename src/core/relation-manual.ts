import type { BookRecord, RelationEvidence } from './types';

export function manualBlockRelation(
  from: string,
  to: string,
  explanation: string,
  reason: string,
): RelationEvidence {
  return {
    from,
    to,
    type: 'manual-block',
    score: 1,
    confidence: 1,
    symmetry: from === to ? 1 : 0,
    reasons: [reason],
    sources: ['manual'],
    explanation,
  };
}

export function manualAllowOverlapRelation(book: BookRecord): RelationEvidence {
  return {
    from: book.id,
    to: book.id,
    type: 'manual-allow-overlap',
    score: 1,
    confidence: 1,
    symmetry: 1,
    reasons: ['manual overlap override'],
    sources: ['manual'],
    explanation:
      'Manual overlap override allows this book to ignore strict prerequisite blocking.',
  };
}

export function manualPrerequisiteRelation(
  from: string,
  to: string,
): RelationEvidence {
  return {
    from,
    to,
    type: 'prerequisite',
    score: 1,
    confidence: 1,
    symmetry: 0,
    reasons: ['manual prerequisite'],
    sources: ['manual'],
    explanation: 'Manual prerequisite forces this ordering.',
  };
}

export function manualCoStudyRelation(
  from: string,
  to: string,
): RelationEvidence {
  return {
    from,
    to,
    type: 'co-study',
    score: 1,
    confidence: 1,
    symmetry: 1,
    reasons: ['manual co-study'],
    sources: ['manual'],
    explanation: 'Manual co-study link keeps these books together.',
  };
}
