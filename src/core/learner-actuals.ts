import {
  LEARNER_ACTUALS_EPOCH_GROUP_SHARE,
  LEARNER_ACTUALS_GROUP_DIRECTION_EPSILON,
  LEARNER_ACTUALS_PROJECT_GROUP_SHARE,
  LEARNER_CALIBRATION_LIFT_CAP,
  LEARNER_CALIBRATION_MIN_PAGES,
  LEARNER_CALIBRATION_PAGE_NORMALIZER,
} from './constants';
import { minutesPerPage } from './constraints';
import { learnerProfile } from './difficulty-profiles';
import type {
  ActualsPropagationMode,
  CalendarEntry,
  PlannerProjectV1,
} from './types';
import { clamp, round2, safeNumber } from './utils';

export type ActualsResidualDirection =
  | 'faster'
  | 'slower'
  | 'mixed'
  | 'neutral'
  | 'none';

export interface LearnerActualsBookEvidence {
  minutes: number;
  pages: number;
  observedMinutesPerPage: number | null;
  expectedMinutesPerPage: number;
  residual: number;
  confidence: number;
}

export interface LearnerActualsGroupEvidence {
  mode: ActualsPropagationMode;
  confidence: number;
  bookCount: number;
  pages: number;
  minutes: number;
  observedMinutesPerPage: number | null;
  residualLift: number;
  residualDirection: ActualsResidualDirection;
  reason: string;
}

export interface LearnerActualsForBook {
  book: LearnerActualsBookEvidence;
  group: LearnerActualsGroupEvidence;
}

export interface LearnerActualsEvidence {
  byBookId: Record<string, LearnerActualsForBook>;
}

interface ActualEntry {
  dateKey: string;
  bookId: string;
  minutes: number;
  pages: number;
}

interface StudyEpoch {
  dateKeys: string[];
  bookIds: string[];
}

function emptyBookEvidence(expectedMinutesPerPage: number): LearnerActualsBookEvidence {
  return {
    minutes: 0,
    pages: 0,
    observedMinutesPerPage: null,
    expectedMinutesPerPage,
    residual: 0,
    confidence: 0,
  };
}

export function disabledGroupEvidence(
  mode: ActualsPropagationMode,
  reason = 'Actuals propagation is book-local.',
): LearnerActualsGroupEvidence {
  return {
    mode,
    confidence: 0,
    bookCount: 0,
    pages: 0,
    minutes: 0,
    observedMinutesPerPage: null,
    residualLift: 0,
    residualDirection: 'none',
    reason,
  };
}

function plannedBookIdsForDate(
  entries: CalendarEntry[],
  maxParallel: number,
): string[] {
  return [
    ...new Set(
      [...entries]
        .sort((left, right) => {
          const actualOrder =
            Number(left.actualOverride) - Number(right.actualOverride);
          return (
            actualOrder ||
            left.short.localeCompare(right.short) ||
            left.bookId.localeCompare(right.bookId)
          );
        })
        .slice(0, Math.max(1, maxParallel))
        .map((entry) => entry.bookId),
    ),
  ].sort();
}

function buildStudyEpochs(
  byDate: Record<string, CalendarEntry[]>,
  maxParallel: number,
): StudyEpoch[] {
  const epochs: Array<StudyEpoch & { setKey: string }> = [];
  Object.keys(byDate)
    .sort()
    .forEach((dateKey) => {
      const bookIds = plannedBookIdsForDate(byDate[dateKey] ?? [], maxParallel);
      if (!bookIds.length) return;
      const setKey = bookIds.join('\u0000');
      const current = epochs[epochs.length - 1];
      if (current?.setKey === setKey) {
        current.dateKeys.push(dateKey);
        return;
      }
      epochs.push({ dateKeys: [dateKey], bookIds, setKey });
    });
  return epochs.map(({ setKey: _setKey, ...epoch }) => epoch);
}

function actualEntries(project: PlannerProjectV1): ActualEntry[] {
  return Object.entries(project.manualOverrides.actuals).flatMap(
    ([dateKey, byBook]) =>
      Object.entries(byBook)
        .map(([bookId, override]) => ({
          dateKey,
          bookId,
          minutes: Math.max(0, safeNumber(override.minutes, 0)),
          pages: Math.max(0, safeNumber(override.pages, 0)),
        }))
        .filter((entry) => entry.minutes > 0 && entry.pages > 0),
  );
}

function expectedMinutes(
  bookId: string,
  expectedDifficultyByBook: Record<string, number>,
  project: PlannerProjectV1,
): number {
  return minutesPerPage(expectedDifficultyByBook[bookId] ?? 5, project.constraints);
}

function bookEvidence(
  entries: ActualEntry[],
  bookId: string,
  expectedDifficultyByBook: Record<string, number>,
  project: PlannerProjectV1,
): LearnerActualsBookEvidence {
  const expected = expectedMinutes(bookId, expectedDifficultyByBook, project);
  const matching = entries.filter((entry) => entry.bookId === bookId);
  const minutes = matching.reduce((total, entry) => total + entry.minutes, 0);
  const pages = matching.reduce((total, entry) => total + entry.pages, 0);
  if (pages <= 0 || minutes <= 0) return emptyBookEvidence(expected);
  const observed = minutes / Math.max(0.1, pages);
  return {
    minutes: round2(minutes),
    pages: round2(pages),
    observedMinutesPerPage: round2(observed),
    expectedMinutesPerPage: round2(expected),
    residual: round2(
      Math.log2(Math.max(0.1, observed) / Math.max(0.1, expected)),
    ),
    confidence: round2(
      clamp(pages / LEARNER_CALIBRATION_PAGE_NORMALIZER, 0, 1),
    ),
  };
}

function directionForResiduals(residuals: number[]): ActualsResidualDirection {
  const positive = residuals.some(
    (value) => value > LEARNER_ACTUALS_GROUP_DIRECTION_EPSILON,
  );
  const negative = residuals.some(
    (value) => value < -LEARNER_ACTUALS_GROUP_DIRECTION_EPSILON,
  );
  if (positive && negative) return 'mixed';
  if (positive) return 'slower';
  if (negative) return 'faster';
  return residuals.length ? 'neutral' : 'none';
}

function summarizeGroupEvidence(input: {
  mode: ActualsPropagationMode;
  entries: ActualEntry[];
  expectedDifficultyByBook: Record<string, number>;
  project: PlannerProjectV1;
}): LearnerActualsGroupEvidence {
  const byBook = new Map<string, LearnerActualsBookEvidence>();
  input.entries.forEach((entry) => {
    if (byBook.has(entry.bookId)) return;
    const matching = input.entries.filter(
      (candidate) => candidate.bookId === entry.bookId,
    );
    byBook.set(
      entry.bookId,
      bookEvidence(
        matching,
        entry.bookId,
        input.expectedDifficultyByBook,
        input.project,
      ),
    );
  });
  const values = [...byBook.values()].filter(
    (entry) => entry.pages > 0 && entry.minutes > 0,
  );
  const minBooks = input.mode === 'project_partial_pooling' ? 3 : 2;
  const minPages =
    input.mode === 'project_partial_pooling'
      ? LEARNER_CALIBRATION_MIN_PAGES * 2
      : LEARNER_CALIBRATION_MIN_PAGES;
  const totalPages = values.reduce((total, entry) => total + entry.pages, 0);
  const totalMinutes = values.reduce((total, entry) => total + entry.minutes, 0);
  if (values.length < minBooks) {
    return {
      ...disabledGroupEvidence(
        input.mode,
        `Group actuals ignored: ${values.length}/${minBooks} books have logged pace evidence.`,
      ),
      bookCount: values.length,
      pages: round2(totalPages),
      minutes: round2(totalMinutes),
      observedMinutesPerPage:
        totalPages > 0
          ? round2(totalMinutes / Math.max(0.1, totalPages))
          : null,
    };
  }
  if (totalPages < minPages) {
    return {
      ...disabledGroupEvidence(
        input.mode,
        `Group actuals ignored: ${round2(totalPages)}/${minPages} logged page(s).`,
      ),
      bookCount: values.length,
      pages: round2(totalPages),
      minutes: round2(totalMinutes),
      observedMinutesPerPage:
        totalPages > 0
          ? round2(totalMinutes / Math.max(0.1, totalPages))
          : null,
    };
  }
  const direction = directionForResiduals(values.map((entry) => entry.residual));
  if (direction === 'mixed') {
    return {
      ...disabledGroupEvidence(
        input.mode,
        'Group actuals ignored: logged books point in mixed faster/slower directions.',
      ),
      bookCount: values.length,
      pages: round2(totalPages),
      minutes: round2(totalMinutes),
      observedMinutesPerPage: round2(totalMinutes / Math.max(0.1, totalPages)),
      residualDirection: 'mixed',
    };
  }
  const weightedResidual =
    values.reduce((total, entry) => total + entry.residual * entry.pages, 0) /
    Math.max(0.1, totalPages);
  const profile = learnerProfile(input.project.constraints);
  const confidenceNormalizer =
    input.mode === 'project_partial_pooling'
      ? LEARNER_CALIBRATION_PAGE_NORMALIZER * 1.5
      : LEARNER_CALIBRATION_PAGE_NORMALIZER;
  const confidence = clamp(totalPages / confidenceNormalizer, 0, 1);
  const residualLift = clamp(
    weightedResidual * 1.25 * profile.feedbackStrength,
    -LEARNER_CALIBRATION_LIFT_CAP,
    LEARNER_CALIBRATION_LIFT_CAP,
  );
  return {
    mode: input.mode,
    confidence: round2(confidence),
    bookCount: values.length,
    pages: round2(totalPages),
    minutes: round2(totalMinutes),
    observedMinutesPerPage: round2(totalMinutes / Math.max(0.1, totalPages)),
    residualLift: round2(residualLift),
    residualDirection: direction,
    reason: `${values.length} book(s), ${round2(totalPages)} logged page(s), ${direction} group pace evidence.`,
  };
}

function entriesForEpochTarget(
  targetBookId: string,
  epochs: StudyEpoch[],
  entries: ActualEntry[],
): ActualEntry[] {
  const selected: ActualEntry[] = [];
  epochs
    .filter((epoch) => epoch.bookIds.includes(targetBookId))
    .forEach((epoch) => {
      const dates = new Set(epoch.dateKeys);
      const books = new Set(epoch.bookIds);
      entries.forEach((entry) => {
        if (dates.has(entry.dateKey) && books.has(entry.bookId)) {
          selected.push(entry);
        }
      });
    });
  return selected;
}

export function buildLearnerActualsEvidence(input: {
  project: PlannerProjectV1;
  byDate: Record<string, CalendarEntry[]>;
  expectedDifficultyByBook: Record<string, number>;
  activeBookIds: string[];
}): LearnerActualsEvidence {
  const mode = input.project.constraints.actualsPropagationMode;
  const entries = actualEntries(input.project);
  const epochs = buildStudyEpochs(input.byDate, input.project.constraints.par);
  const byBookId: Record<string, LearnerActualsForBook> = {};
  const projectGroup =
    mode === 'project_partial_pooling'
      ? summarizeGroupEvidence({
          mode,
          entries: entries.filter((entry) =>
            input.activeBookIds.includes(entry.bookId),
          ),
          expectedDifficultyByBook: input.expectedDifficultyByBook,
          project: input.project,
        })
      : null;

  input.activeBookIds.forEach((bookId) => {
    const book = bookEvidence(
      entries,
      bookId,
      input.expectedDifficultyByBook,
      input.project,
    );
    const group =
      mode === 'epoch_partial_pooling'
        ? summarizeGroupEvidence({
            mode,
            entries: entriesForEpochTarget(bookId, epochs, entries),
            expectedDifficultyByBook: input.expectedDifficultyByBook,
            project: input.project,
          })
        : projectGroup ?? disabledGroupEvidence(mode);
    byBookId[bookId] = { book, group };
  });

  return { byBookId };
}

export function learnerActualsGroupShare(mode: ActualsPropagationMode): number {
  if (mode === 'epoch_partial_pooling') return LEARNER_ACTUALS_EPOCH_GROUP_SHARE;
  if (mode === 'project_partial_pooling')
    return LEARNER_ACTUALS_PROJECT_GROUP_SHARE;
  return 0;
}
