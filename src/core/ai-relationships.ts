import {
  normalizeNumber,
  normalizeString,
  normalizeStringArray,
} from './project-normalize-primitives';
import type {
  AiRecommendationProviderKey,
  AiRelationshipEdgeProposal,
  AiRelationshipProviderResponse,
  AiRelationshipProposal,
  AiRelationshipStageProposal,
  AiRelationshipWizardState,
  PlannerProjectV1,
} from './types';

const RELATIONSHIP_TEXT_FIELD_MAX_CHARS = 520;
const MAX_STAGES = 12;
const MAX_RELATIONS = 400;
const RELATIONSHIP_MAX_WARNINGS = 8;

function truncateRelationshipText(
  value: unknown,
  maxChars = RELATIONSHIP_TEXT_FIELD_MAX_CHARS,
): string {
  return normalizeString(value).replace(/\s+/g, ' ').slice(0, maxChars);
}

function validBookIds(project: PlannerProjectV1): Set<string> {
  return new Set(Object.keys(project.library.books));
}

function normalizeStage(
  rawValue: unknown,
  ids: Set<string>,
  index: number,
): AiRelationshipStageProposal | null {
  const raw =
    rawValue && typeof rawValue === 'object'
      ? (rawValue as Record<string, unknown>)
      : {};
  const bookIds = normalizeStringArray(raw.bookIds ?? raw.books)
    .filter((id) => ids.has(id))
    .filter((id, position, array) => array.indexOf(id) === position);
  if (!bookIds.length) return null;
  return {
    label: truncateRelationshipText(raw.label, 120) || `Stage ${index + 1}`,
    bookIds,
    rationale: truncateRelationshipText(raw.rationale),
  };
}

function normalizeRelation(
  rawValue: unknown,
  ids: Set<string>,
): AiRelationshipEdgeProposal | null {
  const raw =
    rawValue && typeof rawValue === 'object'
      ? (rawValue as Record<string, unknown>)
      : {};
  const from = truncateRelationshipText(raw.from, 120);
  const to = truncateRelationshipText(raw.to, 120);
  if (!ids.has(from) || !ids.has(to) || from === to) return null;
  const type =
    raw.type === 'co-study' || raw.type === 'coStudy'
      ? 'co-study'
      : 'prerequisite';
  return {
    from,
    to,
    type,
    confidence: normalizeNumber(raw.confidence, 0.75, 0, 1),
    rationale: truncateRelationshipText(raw.rationale),
  };
}

export function normalizeAiRelationshipWizard(
  patch: Partial<AiRelationshipWizardState>,
  current: AiRelationshipWizardState,
): AiRelationshipWizardState {
  return {
    ...current,
    ...patch,
    notes: String(patch.notes ?? current.notes ?? '').slice(0, 2000),
    preserveManualRelations:
      patch.preserveManualRelations ?? current.preserveManualRelations,
  };
}

export function normalizeAiRelationshipProposal(
  response: AiRelationshipProviderResponse,
  meta: {
    provider: AiRecommendationProviderKey;
    model: string;
    createdAt: string;
    contextDigest: string;
    wizard: AiRelationshipWizardState;
    project: PlannerProjectV1;
  },
): AiRelationshipProposal {
  const ids = validBookIds(meta.project);
  const stages = (Array.isArray(response.stages) ? response.stages : [])
    .map((entry, index) => normalizeStage(entry, ids, index))
    .filter((entry): entry is AiRelationshipStageProposal => Boolean(entry))
    .slice(0, MAX_STAGES);
  const relations = (Array.isArray(response.relations) ? response.relations : [])
    .map((entry) => normalizeRelation(entry, ids))
    .filter((entry): entry is AiRelationshipEdgeProposal => Boolean(entry))
    .slice(0, MAX_RELATIONS);
  return {
    id: `${meta.createdAt}-${meta.contextDigest}-relationships`,
    provider: meta.provider,
    model: meta.model,
    summary:
      truncateRelationshipText(response.summary) ||
      'Review the proposed relationship and progression changes.',
    stages,
    relations,
    warnings: normalizeStringArray(response.warnings).slice(
      0,
      RELATIONSHIP_MAX_WARNINGS,
    ),
    createdAt: meta.createdAt,
    contextDigest: meta.contextDigest,
    wizard: meta.wizard,
  };
}
