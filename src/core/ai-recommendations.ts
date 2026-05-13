import { normalizedIsbn } from './isbn';
import {
  normalizeNumber,
  normalizeString,
  normalizeStringArray,
} from './project-normalize-primitives';
import type {
  AiRecommendedBook,
  AiProjectSettingSuggestion,
  AiRecommendationProviderKey,
  AiRecommendationProviderResponse,
  AiRecommendationProposal,
} from './types';

const TEXT_FIELD_MAX_CHARS = 220;
const RATIONALE_MAX_CHARS = 520;
const MAX_SUBJECTS = 10;
const MAX_RELATION_REFS = 16;
const MAX_WARNINGS = 6;
const MAX_PROJECT_SETTING_SUGGESTIONS = 8;
const MAX_BOOK_ORDER_REFS = 5000;

export function sanitizeAiPrompt(value: string): string {
  return normalizeString(value).replace(/\s+/g, ' ');
}

export function normalizeAiPromptDraft(value: string): string {
  return String(value ?? '');
}

function truncateText(value: unknown, maxChars = TEXT_FIELD_MAX_CHARS): string {
  return normalizeString(value).replace(/\s+/g, ' ').slice(0, maxChars);
}

function relationRefs(value: unknown): string[] {
  return normalizeStringArray(value).slice(0, MAX_RELATION_REFS);
}

function proposalId(index: number, raw: Record<string, unknown>): string {
  return (
    truncateText(raw.proposalId || raw.id || `proposal-${index + 1}`, 80)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || `proposal-${index + 1}`
  );
}

function normalizeBookProposal(
  rawValue: unknown,
  index: number,
): AiRecommendedBook | null {
  const raw =
    rawValue && typeof rawValue === 'object'
      ? (rawValue as Record<string, unknown>)
      : {};
  const title = truncateText(raw.title);
  if (!title) {
    return null;
  }
  const pages =
    raw.pages == null ? null : normalizeNumber(raw.pages, 250, 1, 5000, true);
  return {
    proposalId: proposalId(index, raw),
    title,
    authors: normalizeStringArray(raw.authors).slice(0, 8),
    isbn: normalizedIsbn(truncateText(raw.isbn, 32)) || null,
    pages,
    subjects: normalizeStringArray(raw.subjects).slice(0, MAX_SUBJECTS),
    displayGroup: truncateText(raw.displayGroup, 80) || 'Core',
    manualSeedDifficulty: normalizeNumber(raw.manualSeedDifficulty, 5, 1, 10),
    rationale: truncateText(raw.rationale, RATIONALE_MAX_CHARS),
    prerequisiteIds: relationRefs(raw.prerequisiteIds ?? raw.prerequisites),
    coStudyIds: relationRefs(raw.coStudyIds ?? raw.coStudy),
  };
}

function normalizeProjectSettingSuggestion(
  rawValue: unknown,
): AiProjectSettingSuggestion | null {
  const raw =
    rawValue && typeof rawValue === 'object'
      ? (rawValue as Record<string, unknown>)
      : {};
  const key = truncateText(raw.key ?? raw.setting, 80);
  const suggestedValue = truncateText(
    raw.suggestedValue ?? raw.value ?? raw.recommendation,
    120,
  );
  if (!key || !suggestedValue) return null;
  return {
    key,
    currentValue: truncateText(raw.currentValue, 120),
    suggestedValue,
    confidence: normalizeNumber(raw.confidence, 0.5, 0, 1),
    rationale: truncateText(raw.rationale, RATIONALE_MAX_CHARS),
  };
}

export function normalizeAiRecommendationProposal(
  response: AiRecommendationProviderResponse,
  meta: {
    provider: AiRecommendationProviderKey;
    model: string;
    prompt: string;
    createdAt: string;
    contextDigest: string;
    maxSuggestions: number;
  },
): AiRecommendationProposal {
  const rawBooks = Array.isArray(response.books) ? response.books : [];
  const books = rawBooks
    .map((entry, index) => normalizeBookProposal(entry, index))
    .filter((entry): entry is AiRecommendedBook => Boolean(entry))
    .slice(0, meta.maxSuggestions);
  const warnings = normalizeStringArray(response.warnings).slice(
    0,
    MAX_WARNINGS,
  );
  const rawProjectSettings = Array.isArray(response.projectSettings)
    ? response.projectSettings
    : [];
  return {
    id: `${meta.createdAt}-${meta.contextDigest}`,
    provider: meta.provider,
    model: meta.model,
    prompt: meta.prompt,
    summary:
      truncateText(response.summary, RATIONALE_MAX_CHARS) ||
      'Review the proposed reading-list addition.',
    books,
    removeBookIds: normalizeStringArray(response.removeBookIds).slice(
      0,
      MAX_BOOK_ORDER_REFS,
    ),
    bookOrder: normalizeStringArray(response.bookOrder).slice(
      0,
      MAX_BOOK_ORDER_REFS,
    ),
    projectSettings: rawProjectSettings
      .map((entry) => normalizeProjectSettingSuggestion(entry))
      .filter((entry): entry is AiProjectSettingSuggestion => Boolean(entry))
      .slice(0, MAX_PROJECT_SETTING_SUGGESTIONS),
    warnings,
    createdAt: meta.createdAt,
    contextDigest: meta.contextDigest,
  };
}

export function relationReferenceTargets(book: AiRecommendedBook): string[] {
  return [...book.prerequisiteIds, ...book.coStudyIds];
}
