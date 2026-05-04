import { describe, expect, it } from 'vitest';

import { NOVELTY_LOAD_MULTIPLIER } from '../../src/core/constants';
import { buildTopicIndex, extractCorpus } from '../../src/core/corpus';
import { DEFAULT_CONSTRAINTS, createDefaultSourceSettings } from '../../src/core/defaults';
import { computeDifficultyModel } from '../../src/core/difficulty';
import { inferRelations } from '../../src/core/relations';
import type {
  BookRecord,
  PlannerProjectV1,
  RelationEvidence,
  ScheduleAlgorithm,
} from '../../src/core/types';
import { clamp, round2 } from '../../src/core/utils';
import { computeSnapshot } from './engine-test-utils';

function makeProject(): PlannerProjectV1 {
  return {
    version: 1,
    library: {
      books: {
        intro: {
          id: 'intro',
          title: 'Introduction to Linear Algebra',
          short: 'Intro LA',
          authors: ['A. Author'],
          displayGroup: 'Core',
          manualSeedDifficulty: 3,
          pages: 220,
          subjects: ['linear algebra', 'vectors', 'matrices'],
          publisher: '',
          isbn: null,
          year: null,
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
            chapters: ['Vectors and matrices', 'Linear systems', 'Eigenvalues'],
            description:
              'A first course in vectors, matrices, linear systems, and eigenvalues.',
            olSubjects: ['linear algebra'],
            tocSource: 'manual',
          },
        },
        advanced: {
          id: 'advanced',
          title: 'Applied Linear Algebra and Optimization',
          short: 'Applied LA',
          authors: ['A. Author'],
          displayGroup: 'Applied',
          manualSeedDifficulty: 6,
          pages: 420,
          subjects: ['linear algebra', 'optimization', 'matrix methods'],
          publisher: '',
          isbn: null,
          year: null,
          manualPrereqs: [],
          manualCoStudy: [],
          owned: true,
          planOrder: 1,
          allowPrereqOverlap: false,
          lockDiff: false,
          noPropOut: false,
          ignored: false,
          constantRD: false,
          completed: false,
          enrichment: {
            chapters: [
              'Review of vector spaces',
              'Advanced matrix decompositions',
              'Convex optimization',
            ],
            description:
              'Builds on vector spaces and matrix methods before moving into optimization.',
            olSubjects: ['optimization'],
            tocSource: 'manual',
          },
        },
      },
    },
    manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
    constraints: { ...DEFAULT_CONSTRAINTS, par: 2, hpd: 2.5, sd: '2026-01-05' },
    sourceSettings: createDefaultSourceSettings(),
    enrichmentCache: {},
    uiPreferences: { ganttView: 'plan', ganttZoom: 1, planColorMode: 'category_mono' },
  };
}

function makeSchedulerModeProject(algorithm: ScheduleAlgorithm): PlannerProjectV1 {
  const project = makeProject();
  const base = project.library.books.intro;
  const makeBook = (
    id: string,
    title: string,
    difficulty: number,
    prereqs: string[] = [],
  ): BookRecord => ({
    ...base,
    id,
    title,
    short: title,
    authors: [`${title} Author`],
    manualSeedDifficulty: difficulty,
    pages: 40,
    subjects: [`${id} subject`],
    manualPrereqs: prereqs,
    manualCoStudy: [],
    owned: true,
    planOrder: title.charCodeAt(0),
    enrichment: {
      ...base.enrichment,
      chapters: [`${title} chapter`],
      description: `${title} material.`,
      olSubjects: [`${id} subject`],
    },
  });
  project.library.books = {
    a_filler: makeBook('a_filler', 'A Filler', 9),
    b_filler: makeBook('b_filler', 'B Filler', 9),
    z_parent: makeBook('z_parent', 'Z Parent', 2),
    z_child: makeBook('z_child', 'Z Child', 2, ['z_parent']),
  };
  project.constraints = {
    ...project.constraints,
    schedAlgo: algorithm,
    feasibilityMode: 'strict_floor',
    backfillMode: 'global',
    prereqMode: 'strict',
    par: 2,
    hpd: 8,
    dpw: 7,
    minPg: 10,
    maxPg: 10,
    bmp: 1,
    gam: 1,
    applyOverlapSkim: false,
    boostUnused: false,
    mutualEnabled: false,
  };
  return project;
}

describe('createPlannerEngine', () => {
  it('infers generic prerequisite structure from corpus overlap', () => {
    const snapshot = computeSnapshot(makeProject());
    expect(
      snapshot.relations.some(
        (relation: RelationEvidence) =>
          relation.type === 'prerequisite' &&
          relation.from === 'intro' &&
          relation.to === 'advanced',
      ),
    ).toBe(true);
  });

  it('produces aligned schedule rows and calendar entries', () => {
    const snapshot = computeSnapshot(makeProject());
    expect(snapshot.renderModel.gantt.rows.length).toBeGreaterThan(0);
    expect(Object.keys(snapshot.dayPlan.byDate).length).toBeGreaterThan(0);
    expect(snapshot.scheduleStats.totalHours).toBeGreaterThan(0);
    expect(snapshot.overlapClusters.length).toBeGreaterThan(0);
  });

  it('is deterministic for identical input projects', () => {
    const first = computeSnapshot(makeProject());
    const second = computeSnapshot(makeProject());
    expect(
      first.renderModel.gantt.rows.map((row) => [
        row.id,
        row.targetStart,
        row.targetEnd,
        row.actualStart,
        row.actualEnd,
      ]),
    ).toEqual(
      second.renderModel.gantt.rows.map((row) => [
        row.id,
        row.targetStart,
        row.targetEnd,
        row.actualStart,
        row.actualEnd,
      ]),
    );
    expect(first.scheduleStats.finishDate?.toISOString()).toEqual(
      second.scheduleStats.finishDate?.toISOString(),
    );
  });

  it('marks impossible manual day windows as hard infeasible', () => {
    const project = makeProject();
    project.constraints.hpd = 1;
    project.constraints.maxPg = 12;
    project.manualOverrides.schedule.advanced = { days: 2 };

    const snapshot = computeSnapshot(project);
    const stats = snapshot.dayPlan.byBookStats.advanced;

    expect(stats.hardInfeasible).toBe(true);
    expect(stats.infeasibleReason).toContain('manual 2-day window');
    expect(
      snapshot.renderModel.warnings.some(
        (warning) =>
          warning.severity === 'fail' && warning.relatedIds?.includes('advanced'),
      ),
    ).toBe(true);
  });

  it('keeps canonical snapshot projections internally consistent', () => {
    const project = makeProject();
    const snapshot = computeSnapshot(project);
    const bookIds = new Set(Object.keys(project.library.books));

    snapshot.renderModel.warnings.forEach((warning) => {
      (warning.relatedIds ?? []).forEach((id) => {
        expect(bookIds.has(id)).toBe(true);
      });
    });

    Object.entries(snapshot.dayPlan.byBook).forEach(([bookId, entries]) => {
      const stats = snapshot.dayPlan.byBookStats[bookId];
      const totalPages = entries.reduce(
        (sum, entry) => sum + entry.readPages + entry.skimPages,
        0,
      );
      const totalMinutes = entries.reduce((sum, entry) => sum + entry.mins, 0);
      const peakDayPages = entries.reduce(
        (peak, entry) => Math.max(peak, entry.readPages + entry.skimPages),
        0,
      );

      expect(stats.usedDays).toBe(entries.length);
      expect(stats.minutes).toBeCloseTo(totalMinutes, 4);
      expect(stats.peakDayPages).toBeCloseTo(peakDayPages, 4);
      expect(totalPages + stats.unfinishedPages).toBeCloseTo(
        project.library.books[bookId].pages,
        1,
      );
    });

    snapshot.renderModel.gantt.rows.forEach((row) => {
      const stats = snapshot.dayPlan.byBookStats[row.id];
      expect(row.actualStart).toBe(stats.actualStart);
      expect(row.actualEnd).toBe(stats.actualEnd);
      expect(row.floorRelaxed).toBe(stats.floorRelaxed);
      expect(row.backfilled).toBe(stats.backfilled);
      expect(row.prereqOverlapUsed).toBe(stats.prereqOverlapUsed);
    });

    if (snapshot.scheduleStats.finishDate) {
      expect(snapshot.scheduleStats.unfinishedBooks).toBe(0);
      expect(snapshot.scheduleStats.blockedBooks).toBe(0);
      expect(snapshot.scheduleStats.hardInfeasibleBooks).toBe(0);
    }
  });

  it('exposes overlap cluster pruning with valid anchor and target books', () => {
    const snapshot = computeSnapshot(makeProject());

    snapshot.overlapClusters.forEach((cluster) => {
      expect(snapshot.topicsById).toBeDefined();
      expect(snapshot.schedulePlan.byId[cluster.primaryBookId]).toBeDefined();
      cluster.bookIds.forEach((bookId) => {
        expect(snapshot.schedulePlan.byId[bookId]).toBeDefined();
      });
      cluster.pruning.forEach((pruning) => {
        expect(cluster.bookIds.includes(pruning.bookId)).toBe(true);
        expect(pruning.topicIds.length).toBeGreaterThan(0);
        expect(pruning.confidence).toBeGreaterThanOrEqual(0);
        expect(pruning.confidence).toBeLessThanOrEqual(1);
      });
    });
  });

  it('blocks manual prerequisite cycles instead of building an impossible graph', () => {
    const project = makeProject();
    project.library.books.intro.manualPrereqs = ['advanced'];
    project.library.books.advanced.manualPrereqs = ['intro'];

    const snapshot = computeSnapshot(project);
    const introPrereqs = snapshot.schedulePlan.prereqById.intro ?? [];
    const advancedPrereqs = snapshot.schedulePlan.prereqById.advanced ?? [];

    expect(introPrereqs.length + advancedPrereqs.length).toBe(1);
    expect(snapshot.relations.some((relation) => relation.type === 'manual-block')).toBe(true);
    expect(snapshot.diagnostics.metrics.prereqCycleBooks).toBe(0);
  });

  it('does not allow co-study links to override prerequisite ancestry', () => {
    const project = makeProject();
    project.library.books.intro.manualPrereqs = [];
    project.library.books.advanced.manualPrereqs = ['intro'];
    project.library.books.intro.manualCoStudy = ['advanced'];
    project.library.books.advanced.manualCoStudy = ['intro'];

    const snapshot = computeSnapshot(project);

    expect(snapshot.schedulePlan.coStudyMeta.groups).toHaveLength(0);
    expect(snapshot.schedulePlan.prereqById.advanced).toContain('intro');
    expect(snapshot.relations.some((relation) => relation.type === 'manual-block')).toBe(true);
    expect(snapshot.diagnostics.metrics.blockedManualRelations).toBeGreaterThan(0);
  });

  it('uses prerequisite direction rather than corpus insertion order for novelty transfer', () => {
    const project = makeProject();
    const intro = {
      ...project.library.books.intro,
      title: 'Alpha Foundations Primer',
      short: 'Alpha Primer',
      manualSeedDifficulty: 3,
      pages: 120,
      subjects: ['alpha foundations', 'alpha methods'],
      manualPrereqs: [],
      manualCoStudy: [],
      enrichment: {
        ...project.library.books.intro.enrichment,
        chapters: ['Alpha foundations', 'Alpha methods'],
        description: 'Alpha foundations alpha methods alpha basics.',
        olSubjects: ['alpha foundations'],
      },
    };
    const advanced = {
      ...project.library.books.advanced,
      title: 'Alpha Extensions and Delta Systems',
      short: 'Alpha Delta',
      manualSeedDifficulty: 7,
      pages: 220,
      subjects: [
        'alpha foundations',
        'alpha methods',
        'delta systems',
        'epsilon models',
        'zeta practice',
      ],
      manualPrereqs: ['intro'],
      manualCoStudy: [],
      enrichment: {
        ...project.library.books.advanced.enrichment,
        chapters: [
          'Alpha foundations review',
          'Alpha methods extension',
          'Delta systems',
          'Epsilon models',
          'Zeta practice',
        ],
        description:
          'Alpha foundations and alpha methods are extended into delta systems epsilon models and zeta practice.',
        olSubjects: ['alpha foundations', 'delta systems'],
      },
    };
    project.library.books = { advanced, intro };

    const corpus = extractCorpus(project);
    const topicIndex = buildTopicIndex(corpus);
    const relationInfo = inferRelations(corpus, topicIndex, project);
    const pair = relationInfo.byPair['advanced|intro'];
    expect(pair.leftId).toBe('advanced');
    expect(pair.rightId).toBe('intro');
    expect(pair.coverageBA).toBeGreaterThan(pair.coverageAB + 0.2);

    const model = computeDifficultyModel(corpus, topicIndex, relationInfo, project);
    const correctLoad = round2(
      clamp(1 - pair.coverageBA, 0, 1.2) *
        project.constraints.propNovelty *
        NOVELTY_LOAD_MULTIPLIER,
    );
    const wrongLoad = round2(
      clamp(1 - pair.coverageAB, 0, 1.2) *
        project.constraints.propNovelty *
        NOVELTY_LOAD_MULTIPLIER,
    );

    expect(correctLoad).not.toBe(wrongLoad);
    expect(model.byId.advanced.noveltyLoad).toBe(correctLoad);
  });

  it('batches oversized co-study groups before day allocation enforces synchronization', () => {
    const project = makeProject();
    const base = project.library.books.intro;
    const makeBook = (id: string, index: number, mutualIds: string[]): BookRecord => ({
      ...base,
      id,
      title: `Co Study ${index}`,
      short: `C${index}`,
      authors: [`Author ${index}`],
      manualSeedDifficulty: 3,
      pages: 20,
      subjects: [`topic ${index}`],
      manualPrereqs: [],
      manualCoStudy: mutualIds,
      owned: true,
      planOrder: index,
      enrichment: {
        ...base.enrichment,
        chapters: [`Topic ${index} chapter`],
        description: `Topic ${index} material.`,
        olSubjects: [`topic ${index}`],
      },
    });
    project.library.books = {
      b1: makeBook('b1', 1, ['b2']),
      b2: makeBook('b2', 2, ['b1', 'b3']),
      b3: makeBook('b3', 3, ['b2', 'b4']),
      b4: makeBook('b4', 4, ['b3']),
    };
    project.constraints = {
      ...project.constraints,
      par: 2,
      hpd: 4,
      minPg: 1,
      maxPg: 20,
      mutualEnabled: true,
      mutualOversize: 'batch',
      boostUnused: false,
    };

    const snapshot = computeSnapshot(project);
    const groupSizes = snapshot.schedulePlan.coStudyMeta.groups
      .map((group) => group.ids.length)
      .sort((left, right) => left - right);
    const firstDay = Object.entries(snapshot.dayPlan.byDate).sort(
      ([left], [right]) => left.localeCompare(right),
    )[0]?.[1] ?? [];

    expect(groupSizes).toEqual([2, 2]);
    expect(firstDay).toHaveLength(2);
    expect(snapshot.scheduleStats.peakBooks).toBeLessThanOrEqual(2);
    expect(snapshot.scheduleStats.finishDate).toBeDefined();
  });

  it('wires scheduler modes into actual timeframe selection', () => {
    const snapshots = {
      balanced: computeSnapshot(makeSchedulerModeProject('balanced')),
      greedy: computeSnapshot(makeSchedulerModeProject('greedy')),
      critical: computeSnapshot(makeSchedulerModeProject('critical')),
      fastest: computeSnapshot(makeSchedulerModeProject('fastest')),
    };
    expect(snapshots.balanced.scheduleStats.spanSlots).toBe(10);
    expect(snapshots.greedy.scheduleStats.spanSlots).toBe(10);
    expect(snapshots.critical.scheduleStats.spanSlots).toBe(9);
    expect(snapshots.fastest.scheduleStats.spanSlots).toBe(8);
    expect(snapshots.fastest.schedulePlan.selectedAlgorithm).toBe('fastest');
    expect(snapshots.fastest.scheduleStats.spanSlots).toBeLessThanOrEqual(
      Math.min(
        snapshots.balanced.scheduleStats.spanSlots,
        snapshots.greedy.scheduleStats.spanSlots,
        snapshots.critical.scheduleStats.spanSlots,
      ),
    );
  });

  it('uses corpus seed estimates when imported books have neutral manual seeds', () => {
    const project = makeProject();
    project.library.books.intro.manualSeedDifficulty = 5;
    project.library.books.advanced.manualSeedDifficulty = 5;
    project.library.books.advanced.pages = 900;
    project.library.books.advanced.title = 'Advanced Research Monograph in Optimization';

    const snapshot = computeSnapshot(project);

    expect(snapshot.difficultyModel.intro.seed).not.toBe(snapshot.difficultyModel.advanced.seed);
    expect(snapshot.difficultyModel.advanced.seed).toBeGreaterThan(snapshot.difficultyModel.intro.seed);
  });

  it('maps study slots onto selected weekdays instead of raw calendar days', () => {
    const project = makeProject();
    project.constraints.sd = '2026-01-04';
    project.constraints.dpw = 1;
    project.constraints.weekdaysCustom = true;
    project.constraints.studyWeekdays = [0];

    const snapshot = computeSnapshot(project);
    const dates = Object.keys(snapshot.dayPlan.byDate);

    expect(dates.length).toBeGreaterThan(1);
    dates.slice(0, 3).forEach((dateKey) => {
      expect(new Date(`${dateKey}T12:00:00Z`).getUTCDay()).toBe(0);
    });
  });

  it('propagates actual calendar minutes and pages into remaining work', () => {
    const project = makeProject();
    const baseline = computeSnapshot(project);
    const firstDate = Object.keys(baseline.dayPlan.byDate).sort()[0];
    const firstEntry = baseline.dayPlan.byDate[firstDate]?.find((entry) => entry.bookId === 'intro');
    expect(firstEntry).toBeDefined();

    project.manualOverrides.actuals[firstDate] = {
      intro: {
        minutes: Math.max(1, Math.floor((firstEntry?.mins ?? 1) / 2)),
        pages: 1.5,
        done: true,
      },
    };

    const adjusted = computeSnapshot(project);
    const adjustedEntry = adjusted.dayPlan.byDate[firstDate]?.find((entry) => entry.bookId === 'intro');

    expect(adjustedEntry?.actualOverride).toBe(true);
    expect(adjustedEntry?.done).toBe(true);
    expect(adjustedEntry?.mins).toBe(project.manualOverrides.actuals[firstDate].intro.minutes);
    expect(adjustedEntry?.actualPages).toBe(1.5);
    expect(Math.round(((adjustedEntry?.readPages ?? 0) + (adjustedEntry?.skimPages ?? 0)) * 10) / 10).toBe(1.5);
  });
});
