export const STOP_WORDS = new Set(
  'the a an of in on for to and with by from into onto over under about around within without toward towards across between is are was were be been being have has had do does did will would shall should may might can could this that these those it its their there here where when while who whom whose your our ours my mine his hers them they we us not no yes or if then else than also only very much many some any every each either neither both own same such using use used via per based'.split(
    ' ',
  ),
);

export const INTRO_CUES = [
  'intro',
  'introduction',
  'primer',
  'beginner',
  'fundamentals',
  'basics',
  'first course',
  'essentials',
  'guide',
];

export const ADVANCED_CUES = [
  'advanced',
  'graduate',
  'research',
  'monograph',
  'selected topics',
  'theory',
  'reference',
];

export const BRIDGE_CUES = [
  'builds on',
  'assumes',
  'requires',
  'review',
  'reviews',
  'recall',
  'background',
  'prior knowledge',
  'before moving into',
  'moving into',
];

export const SERIES_PATTERN = /(?:vol(?:ume)?|part|book|bk)\.?\s*(\d+)/i;
export const MAX_PHRASE_NGRAM = 3;
export const MAX_TOPIC_CANDIDATES_PER_BOOK = 28;
export const TOPIC_MATCH_SIMILARITY = 0.4;
export const CONTAINMENT_SIMILARITY_HINT = 0.82;
// Relation inference compares the same topic labels many times; cap caches to avoid unbounded growth.
export const TEXT_SIMILARITY_CACHE_LIMIT = 50_000;

export const GENERIC_DIFFICULTY_BASE = 4.9;
export const GENERIC_DIFFICULTY_INTRO_SHIFT = -1.0;
export const GENERIC_DIFFICULTY_ADVANCED_SHIFT = 1.0;
export const GENERIC_DIFFICULTY_LONG_BOOK_THRESHOLD = 700;
export const GENERIC_DIFFICULTY_MEDIUM_BOOK_THRESHOLD = 450;
export const GENERIC_DIFFICULTY_SHORT_BOOK_THRESHOLD = 180;
export const GENERIC_DIFFICULTY_LONG_BOOK_SHIFT = 0.8;
export const GENERIC_DIFFICULTY_MEDIUM_BOOK_SHIFT = 0.35;
export const GENERIC_DIFFICULTY_SHORT_BOOK_SHIFT = -0.4;
export const GENERIC_DIFFICULTY_PAGE_SCALE_BASE = 300;
export const GENERIC_DIFFICULTY_PAGE_LOG_WEIGHT = 0.45;
export const GENERIC_DIFFICULTY_PAGE_LOG_MIN = -0.7;
export const GENERIC_DIFFICULTY_PAGE_LOG_MAX = 1.1;

export const TOPIC_COMPLEXITY_BASE = 1;
export const TOPIC_COMPLEXITY_RARITY_WEIGHT = 2.4;
export const TOPIC_COMPLEXITY_BREADTH_WEIGHT = 2.2;
export const TOPIC_COMPLEXITY_CHAPTER_SPREAD_WEIGHT = 1.6;

export const BOOK_COMPLEXITY_SEED_WEIGHT = 0.42;
export const BOOK_COMPLEXITY_RARITY_WEIGHT = 0.9;
export const BOOK_COMPLEXITY_BREADTH_WEIGHT = 1.1;
export const BOOK_COMPLEXITY_LEXICAL_WEIGHT = 0.7;
export const BOOK_COMPLEXITY_BREADTH_DIVISOR = 18;
export const BOOK_COMPLEXITY_LEXICAL_MULTIPLIER = 18;

export const PHRASE_WEIGHT_BASE = 0.42;
export const TOKEN_WEIGHT_BASE = 0.2;
export const FOCUS_WEIGHT_BASE = 0.48;

export const PREREQ_SCORE_THRESHOLD = 0.52;
export const PREREQ_SCORE_MARGIN = 0.06;
export const CO_STUDY_SCORE_THRESHOLD = 0.66;
export const CO_STUDY_OVERLAP_THRESHOLD = 0.24;
export const REFERENCE_SCORE_THRESHOLD = 0.24;
// Small libraries stay exhaustive for maximum recall; large libraries use topic-indexed candidates.
export const MAX_EXHAUSTIVE_RELATION_BOOKS = 80;
// Very common topics add little signal and otherwise recreate all-pairs scoring.
export const MAX_RELATION_INDEX_TOPIC_FREQUENCY = 180;
// Large-library relation inference keeps only the strongest indexed neighbors per book.
export const MAX_INDEXED_RELATION_CANDIDATES_PER_BOOK = 16;
// Token-neighbor pairs preserve fuzzy topic recall without reverting to all-pairs scoring.
export const RELATION_INDEX_TOKEN_PAIR_WEIGHT = 0.35;
// Strategy meta-search is useful for normal plans but too expensive for large libraries.
export const MAX_FASTEST_META_SEARCH_BOOKS = 300;

export const PREREQ_WEIGHT_COVERAGE = 0.32;
export const PREREQ_WEIGHT_NOVELTY = 0.13;
export const PREREQ_WEIGHT_COMPLEXITY = 0.1;
export const PREREQ_WEIGHT_SEED = 0.12;
export const PREREQ_WEIGHT_PAGE = 0.07;
export const PREREQ_WEIGHT_SERIES = 0.08;
export const PREREQ_WEIGHT_PROGRESSION = 0.14;
export const PREREQ_WEIGHT_SAME_AUTHOR = 0.04;

export const CO_STUDY_WEIGHT_OVERLAP = 0.72;
export const CO_STUDY_WEIGHT_SYMMETRY = 0.18;
export const CO_STUDY_WEIGHT_SAME_AUTHOR = 0.05;

export const REFERENCE_WEIGHT_OVERLAP = 0.7;
export const REFERENCE_WEIGHT_PREREQ = 0.12;

export const RELATION_CONFIDENCE_PRIMARY_WEIGHT = 0.82;
export const RELATION_CONFIDENCE_SECONDARY_WEIGHT = 0.18;
export const REFERENCE_CONFIDENCE_MULTIPLIER = 0.88;

export const GRAPH_BURDEN_PARENT_WEIGHT = 0.22;
export const GRAPH_BURDEN_DEPTH_WEIGHT = 0.12;
export const NOVELTY_LOAD_MULTIPLIER = 5.2;
export const BREADTH_LOAD_MULTIPLIER = 4.2;
export const RETENTION_LOAD_MULTIPLIER = 1.2;
export const SCHEDULE_DIFFICULTY_SEED_WEIGHT = 0.38;
export const SCHEDULE_DIFFICULTY_CORPUS_WEIGHT = 0.42;

// Adaptive workload priors keep sparse, technical books from being confidently easy.
export const SUBJECT_WORKLOAD_DEFAULT = 60;
export const SUBJECT_WORKLOAD_MIN = 0;
export const SUBJECT_WORKLOAD_MAX = 100;
export const WORKLOAD_CLUSTER_SIMILARITY_THRESHOLD = 0.28;
export const WORKLOAD_TOPIC_SIMILARITY_WEIGHT = 0.45;
export const WORKLOAD_TOKEN_SIMILARITY_WEIGHT = 0.25;
export const WORKLOAD_RELATION_SIMILARITY_WEIGHT = 0.2;
export const WORKLOAD_FINGERPRINT_SIMILARITY_WEIGHT = 0.1;
export const WORKLOAD_LIFT_CAP = 1.6;
// Above this size, workload clustering scores only indexed topic/relation neighbors.
export const MAX_EXHAUSTIVE_WORKLOAD_PROFILES = 120;
// Very common workload features are weak cluster evidence and too expensive to pair exhaustively.
export const MAX_WORKLOAD_INDEX_FEATURE_FREQUENCY = 180;
export const WORKLOAD_LOW_METADATA_CONFIDENCE = 0.42;
export const WORKLOAD_SPARSE_SPECIALIZED_CONFIDENCE = 0.72;
export const WORKLOAD_SPECIALIZED_TOPIC_COUNT = 5;
export const WORKLOAD_SPECIALIZED_COMPLEXITY_FLOOR = 5.8;
export const WORKLOAD_SPECIALIZED_RARITY_FLOOR = 1.2;

export const AUTO_RD_MIN_CHAIN_FLOOR = 2;
export const AUTO_RD_CONFIDENCE_THRESHOLD = 0.78;

export const PRACTICAL_MIN_PAGE_FLOOR = 1;
// Preserve the historical default time curve while decoupling display compression controls from hours.
export const TIME_DIFFICULTY_RESPONSE_EXPONENT = 0.65;
// Overview zoom must stay low enough to inspect long plans without losing clickable bars.
export const PLAN_ZOOM_MIN = 0.04;
export const PLAN_ZOOM_MAX = 3;
export const LIBRARY_LIST_WIDTH_MIN = 320;
export const LIBRARY_LIST_WIDTH_MAX = 760;
export const LIBRARY_LIST_WIDTH_STEP = 24;

export function clampLibraryListWidth(widthPx: number): number {
  return Math.max(
    LIBRARY_LIST_WIDTH_MIN,
    Math.min(LIBRARY_LIST_WIDTH_MAX, Math.round(widthPx)),
  );
}
export const RELATIVE_PACING_MIN = 0;
export const RELATIVE_PACING_DEFAULT = 50;
export const RELATIVE_PACING_MAX = 100;
export const LEARNER_ADAPTIVITY_MIN = 0;
export const LEARNER_ADAPTIVITY_DEFAULT = 50;
export const LEARNER_ADAPTIVITY_MAX = 100;
export const TARGET_CHALLENGE_MIN = 0;
export const TARGET_CHALLENGE_DEFAULT = 55;
export const TARGET_CHALLENGE_MAX = 100;
// Logged actuals need enough pages before they are allowed to recalibrate workload.
export const LEARNER_CALIBRATION_MIN_PAGES = 20;
// Shrink observed pace strongly toward the selected profile until a real history exists.
export const LEARNER_CALIBRATION_PAGE_NORMALIZER = 160;
// A single outlier should never move schedule difficulty by more than this amount.
export const LEARNER_CALIBRATION_LIFT_CAP = 1.2;
// Low-confidence evidence still contributes, but diagnostics should make the uncertainty visible.
export const DIFFICULTY_HIGH_UNCERTAINTY = 0.55;
// Cohort mode favors continuing active books before rotating in fresh starts.
export const DAILY_COHORT_ACTIVE_BONUS = 4.5;
export const DAILY_COHORT_NEW_START_PENALTY = 1.25;
export const SMART_OVERLAP_REMAINING_FRACTION = 0.2;
export const SMART_OVERLAP_REMAINING_DAYS = 5;
// Tiny tolerance for decimal minute math so exact-fit chunks are not rejected by floating error.
export const DAY_PLAN_BUDGET_EPSILON_MINUTES = 1e-6;
// Stop allocation loops once less than a hundredth of a minute remains useful.
export const DAY_PLAN_ACTIVE_BUDGET_EPSILON_MINUTES = 0.01;
// Hard guard against accidental non-converging allocation loops.
export const DAY_PLAN_ALLOCATION_GUARD_LIMIT = 5000;
// Daily allocation only needs a bounded frontier because visible parallel slots are limited.
export const DAY_PLAN_CANDIDATE_SCAN_LIMIT = 32;
// Later-stage starts rank behind strict-ready starts unless needed to fill occupancy.
export const DAY_PLAN_BACKFILL_STAGE_PENALTY = 0.22;
export const DAY_PLAN_SMART_PREREQ_STAGE_PENALTY = 0.42;
export const DAY_PLAN_SOFT_PREREQ_STAGE_PENALTY = 0.68;
// Full co-study groups get a small lift so synchronized starts stay together.
export const DAY_PLAN_COSTUDY_GROUP_BONUS_PER_MEMBER = 0.18;
export const DEFAULT_TIMELINE_BUFFER_DAYS = 365;
export const MIN_TOTAL_TIMELINE_DAYS = 720;
export const DAYS_PER_MONTH_APPROX = 30.44;
export const WEEKS_PER_MONTH_APPROX = 4.345;
