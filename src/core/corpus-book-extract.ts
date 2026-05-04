import {
  ADVANCED_CUES,
  INTRO_CUES,
} from './constants';
import { genericEstimateDifficulty } from './constraints';
import type { CorpusBook } from './internal-types';
import type { BookRecord } from './types';
import {
  cueProfileForBook,
  normalizeText,
  parseSeriesInfo,
  phraseCandidates,
  titleShort,
  tokenizeWords,
  countTokens,
} from './text';
import { asArray, deepClone, sum, unique } from './utils';

export function corpusBookFromRecord(id: string, book: BookRecord): CorpusBook {
  const chapterTitles = asArray(book.enrichment.chapters).map((chapter) => String(chapter || '')).filter(Boolean);
  const subjectTexts = unique([...(book.subjects || []), ...(book.enrichment.olSubjects || [])]);
  const sources = [book.title, book.short, ...subjectTexts, String(book.enrichment.description || '').slice(0, 800)];
  const focusTokens = tokenizeWords([book.title, book.short, ...subjectTexts].join(' '));
  const wordCounts: Record<string, number> = {};
  const phraseCounts: Record<string, number> = {};
  const focusTokenCounts = countTokens(focusTokens);
  const chapterProfiles = chapterTitles.map((title, idx) => ({
    idx,
    title,
    words: tokenizeWords(title),
    phrases: phraseCandidates(title),
  }));

  sources.concat(chapterTitles).filter(Boolean).forEach((source) => {
    const words = tokenizeWords(source);
    words.forEach((word) => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
    phraseCandidates(source).forEach((phrase) => {
      phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
    });
  });

  const totalWords = sum(Object.values(wordCounts));
  return {
    ...book,
    id,
    short: book.short || titleShort(book.title, id),
    displayGroup: String(book.displayGroup || 'Core'),
    pages: Math.max(1, Math.trunc(book.pages || 300) || 300),
    enrichment: deepClone(book.enrichment),
    chapterProfiles,
    subjectTexts,
    wordCounts,
    phraseCounts,
    totalWords,
    uniqueWords: Object.keys(wordCounts).length,
    lexicalDensity: totalWords ? Object.keys(wordCounts).length / totalWords : 0,
    sequence: parseSeriesInfo(book.title),
    seedEstimate: genericEstimateDifficulty(
      book.title,
      book.pages,
      subjectTexts,
      book.publisher,
      normalizeText,
      INTRO_CUES,
      ADVANCED_CUES,
    ),
    focusTokenCounts,
    cueProfile: cueProfileForBook(book.title, book.short, subjectTexts, chapterTitles, book.enrichment.description),
  };
}
