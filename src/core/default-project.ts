import {
  LEARNER_ADAPTIVITY_DEFAULT,
  RELATIVE_PACING_DEFAULT,
  SUBJECT_WORKLOAD_DEFAULT,
  TARGET_CHALLENGE_DEFAULT,
} from './constants';
import { defaultAiModel } from './ai-provider-registry';
import {
  createDefaultQbittorrentConnectionSettings,
  createDefaultQbittorrentStatus,
  createDefaultSourceSettings,
} from './default-source-settings';
import type {
  AiConnectionSettings,
  AiRecommendationSettings,
  BookRecord,
  ConstraintSet,
  PlannerProjectV1,
  UiState,
  UiPreferences,
} from './types';
import { localDateKey } from './time';

export const DEFAULT_DISPLAY_GROUPS: Record<string, number> = {
  Core: 1,
  Supporting: 1,
  Applied: 1,
  Stretch: 1,
};

export function createDefaultConstraints(): ConstraintSet {
  return {
    damp: 0.35,
    gam: 1.5,
    mode: 'difficulty',
    tl: 18,
    par: 3,
    hpd: 3,
    dpw: 5,
    pt: 0.3,
    bmp: 20,
    sd: localDateKey(),
    minPg: 7,
    maxPg: 24,
    relativePacingStrength: RELATIVE_PACING_DEFAULT,
    relativePacingCurve: 'smoothstep',
    learnerProfileMode: 'balanced_adaptive',
    learnerAdaptivityStrength: LEARNER_ADAPTIVITY_DEFAULT,
    targetChallenge: TARGET_CHALLENGE_DEFAULT,
    subjectWorkloadStrength: SUBJECT_WORKLOAD_DEFAULT,
    dailyBookMode: 'interspersed',
    emptyDayPolicy: 'fill_when_possible',
    bookOrderPolicy: 'auto',
    schedAlgo: 'balanced',
    feasibilityMode: 'strict_floor',
    backfillMode: 'global',
    prereqMode: 'strict',
    skimRatio: 0.35,
    prereqRetention: 0.45,
    propLiftCap: 2.2,
    propMix: 0.65,
    propBreadth: 0.12,
    propNovelty: 0.18,
    blendMode: 'geometric',
    alphaCap: 0.5,
    absFloor: 0.55,
    compressMode: 'auto',
    compressCurve: 'power',
    compressExp: 0.65,
    diffMapMode: 'raw',
    diffMapMin: 2,
    diffMapMax: 9,
    diffCurveFloorPoint: 0,
    diffCurveCeilingPoint: 1,
    diffRamp: 1,
    applyOverlapSkim: true,
    boostUnused: true,
    boostStrength: 1,
    mutualEnabled: true,
    mutualOversize: 'batch',
    autoRD: false,
    rdMinChain: 4,
    rdMinSlope: 0.35,
    tr: true,
    part: false,
    excComp: true,
    displayGroups: { ...DEFAULT_DISPLAY_GROUPS },
    studyWeekdays: [1, 2, 3, 4, 5],
    weekdaysCustom: false,
  };
}

export const DEFAULT_CONSTRAINTS: ConstraintSet = createDefaultConstraints();

export function createDefaultAiRecommendationSettings(): AiRecommendationSettings {
  return {
    maxSuggestions: 4,
    includeExistingContext: true,
  };
}

export function createDefaultAiConnectionSettings(): AiConnectionSettings {
  return {
    enabled: false,
    provider: 'openai',
    model: defaultAiModel('openai'),
    endpointUrl: '',
    apiKey: '',
    timeoutMs: 60000,
    maxOutputTokens: 1800,
  };
}

const DEFAULT_UI_PREFERENCES: UiPreferences = {
  ganttView: 'plan',
  ganttZoom: 1,
  planColorMode: 'category_mono',
  planSections: {
    gantt: true,
    calendar: true,
  },
  libraryListWidthPx: 460,
  dismissedWarningCodes: [],
};

export function createDefaultUiPreferences(): UiPreferences {
  return {
    ...DEFAULT_UI_PREFERENCES,
    planSections: { ...DEFAULT_UI_PREFERENCES.planSections },
    dismissedWarningCodes: [...DEFAULT_UI_PREFERENCES.dismissedWarningCodes],
  };
}

export const DEFAULT_UI_STATE: UiState = {
  activeView: 'plan',
  selectedBookId: null,
  selectedCalendarEntry: null,
  ganttView: DEFAULT_UI_PREFERENCES.ganttView,
  ganttZoom: DEFAULT_UI_PREFERENCES.ganttZoom,
  planColorMode: DEFAULT_UI_PREFERENCES.planColorMode,
  planSections: { ...DEFAULT_UI_PREFERENCES.planSections },
  libraryListWidthPx: DEFAULT_UI_PREFERENCES.libraryListWidthPx,
  openConstraintGroups: [],
  selectedConstraintKey: null,
  graphOptionsOpen: false,
  bookSearchQuery: '',
  bookSearchStatus: 'idle',
  bookSearchResults: [],
  bookSearchHasMore: false,
  bookSearchOffset: 0,
  bookSearchError: null,
  importExportText: '',
  importExportDirty: false,
  qbittorrentConnection: createDefaultQbittorrentConnectionSettings(),
  qbittorrentStatus: createDefaultQbittorrentStatus(),
  documentReader: {
    bookId: null,
    documentId: null,
    status: 'idle',
    title: '',
    text: '',
    error: null,
  },
  documentCandidates: {
    bookId: null,
    status: 'idle',
    candidates: [],
    error: null,
    manualSource: '',
  },
  aiPrompt: '',
  aiConnection: createDefaultAiConnectionSettings(),
  aiStatus: {
    state: 'idle',
    message: 'Enter a goal, then ask the recommender for a proposed addition.',
  },
  aiProposal: null,
  debugUi: false,
  banner: null,
};

export const EMPTY_PROJECT: PlannerProjectV1 = {
  version: 1,
  library: { books: {} },
  enrichmentCache: {},
  manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
  constraints: DEFAULT_CONSTRAINTS,
  aiRecommendationSettings: createDefaultAiRecommendationSettings(),
  sourceSettings: createDefaultSourceSettings(),
  uiPreferences: createDefaultUiPreferences(),
};

export const EXAMPLE_BOOK: BookRecord = {
  id: 'book-1',
  title: 'Example Book',
  short: 'Example',
  authors: ['Author Name'],
  displayGroup: 'Core',
  manualSeedDifficulty: 5,
  pages: 220,
  subjects: ['example topic'],
  publisher: '',
  isbn: null,
  year: null,
  sourcePath: null,
  documents: [],
  selectedDocumentId: null,
  documentAcquisition: {
    candidateQueue: [],
    blockedCandidates: [],
    searchAttempts: [],
    greylist: {},
  },
  openLibraryKey: null,
  openLibraryEditionKey: null,
  openLibraryWorkKey: null,
  googleBooksId: null,
  manualPrereqs: [],
  manualCoStudy: [],
  owned: true,
  planOrder: 0,
  allowPrereqOverlap: false,
  lockDiff: false,
  noPropOut: false,
  ignored: false,
  constantRD: false,
  completed: false,
  enrichment: {
    chapters: [],
    description: '',
    olSubjects: [],
    tocSource: 'none',
  },
};
