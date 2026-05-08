import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createEmptyProject,
  normalizeProject,
  parseProject,
  serializeProject,
} from '../../src/core/project-file';

describe('project-file boundary', () => {
  it('round-trips PlannerProjectV1', () => {
    const project = normalizeProject({
      version: 1,
      library: { books: {} },
      manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
      constraints: { sd: '2026-01-05' },
      enrichmentCache: {},
      uiPreferences: {
        ganttView: 'plan',
        ganttZoom: 1,
        planColorMode: 'category_mono',
      },
    });
    const parsed = parseProject(serializeProject(project));
    expect(parsed.version).toBe(1);
    expect(parsed.constraints.sd).toBe('2026-01-05');
    expect(parsed.sourceSettings.contentPreference).toEqual([
      'text',
      'epub',
      'ocr_text',
      'pdf',
    ]);
    expect(parsed.sourceSettings.documentSources.qbittorrent).toBe(true);
    expect(parsed.sourceSettings.documentSources.localOcr).toBe(false);
    expect(parsed.sourceSettings.qbittorrent.searchPlugins).toBe(true);
    expect(parsed.sourceSettings.qbittorrent.maxResults).toBe(100);
    expect(parsed.sourceSettings.qbittorrent.allowedSites).toEqual(
      expect.arrayContaining([
        'archive.org',
        'gutenberg.org',
        'standardebooks.org',
      ]),
    );
    expect(parsed.uiPreferences.planSections).toEqual({
      gantt: true,
      calendar: true,
    });
    expect(parsed.uiPreferences.libraryListWidthPx).toBe(460);
    expect(parsed.uiPreferences.dismissedWarningCodes).toEqual([]);
  });

  it('normalizes source masks and excludes local integration credentials from exports', () => {
    const project = normalizeProject({
      version: 1,
      library: { books: {} },
      manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
      constraints: {},
      enrichmentCache: {},
      uiPreferences: {},
      sourceSettings: {
        metadataSources: { openlibrary: false },
        documentSources: { qbittorrent: true },
        qbittorrent: {
          searchPlugins: true,
          allowedPlugins: ['z-plugin', 'open-plugin', 'open-plugin', ''],
          allowedSites: [
            'StandardEBooks.org',
            'archive.org',
            'archive.org',
            '',
          ],
          categories: ['zines', 'books', 'books', ''],
          maxResults: 500,
        },
        qbittorrentConnection: {
          username: 'user',
          password: 'must-not-export',
        },
      },
    });
    const exported = serializeProject(project);

    expect(project.sourceSettings.metadataSources.openlibrary).toBe(false);
    expect(project.sourceSettings.metadataSources.googleBooks).toBe(true);
    expect(project.sourceSettings.documentSources.qbittorrent).toBe(true);
    expect(project.sourceSettings.qbittorrent.searchPlugins).toBe(true);
    expect(project.sourceSettings.qbittorrent.allowedPlugins).toEqual([
      'open-plugin',
      'z-plugin',
    ]);
    expect(project.sourceSettings.qbittorrent.allowedSites).toEqual([
      'archive.org',
      'standardebooks.org',
    ]);
    expect(project.sourceSettings.qbittorrent.categories).toEqual([
      'books',
      'zines',
    ]);
    expect(project.sourceSettings.qbittorrent.maxResults).toBe(150);
    expect(exported).not.toContain('must-not-export');
    expect(exported).not.toContain('qbittorrentConnection');
  });

  it('imports failed enrichment entries with usable data as stale cache entries', () => {
    const project = normalizeProject({
      version: 1,
      library: {
        books: {
          alpha: { title: 'Alpha', pages: 200 },
        },
      },
      manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
      constraints: {},
      enrichmentCache: {
        alpha: {
          status: 'failed',
          bookId: 'alpha',
          cacheKey: 'alpha',
          error: 'NetworkError when attempting to fetch resource.',
          data: {
            description: 'Previous usable enrichment.',
            chapters: ['Chapter 1'],
            olSubjects: ['subject'],
          },
        },
      },
      uiPreferences: {},
    });

    expect(project.enrichmentCache.alpha?.status).toBe('stale');
    expect(project.enrichmentCache.alpha?.data?.chapters).toEqual([
      'Chapter 1',
    ]);
    expect(project.enrichmentCache.alpha?.error).toContain('NetworkError');
  });

  it('repairs stale unreadable PDF document refs as complete openable documents', () => {
    const project = normalizeProject({
      version: 1,
      library: {
        books: {
          electronics: {
            title: 'Practical Electronics for Inventors',
            pages: 1200,
            documents: [
              {
                id: 'pdf-1',
                provider: 'qbittorrent',
                fileName: 'Practical Electronics for Inventors.pdf',
                storagePath:
                  'output/data/documents/Practical Electronics for Inventors.pdf',
                contentKind: 'pdf',
                contentType: 'application/pdf',
                accessBasis: 'user_provided',
                status: 'unreadable',
                matchScore: 0.45,
                availability: {
                  seeders: 7,
                  peers: 0,
                  progress: 1,
                  state: 'stalledUP',
                },
                provenance: {
                  provider: 'qbittorrent',
                  fetchedAt: '2026-04-30T00:00:00.000Z',
                  confidence: 0.45,
                },
                createdAt: '2026-04-30T00:00:00.000Z',
                updatedAt: '2026-04-30T00:00:00.000Z',
              },
            ],
          },
        },
      },
      manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
      constraints: {},
      enrichmentCache: {},
      uiPreferences: {},
    });

    expect(project.library.books.electronics?.documents?.[0]?.status).toBe(
      'complete',
    );
  });

  it('removes stale manual relation ids during project normalization', () => {
    const project = normalizeProject({
      version: 1,
      library: {
        books: {
          alpha: {
            title: 'Alpha',
            manualPrereqs: ['missing', 'beta', 'alpha', 'beta'],
            manualCoStudy: ['missing', 'beta', 'alpha', 'beta'],
          },
          beta: { title: 'Beta' },
        },
      },
      manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
      constraints: {},
    });

    expect(project.library.books.alpha?.manualPrereqs).toEqual(['beta']);
    expect(project.library.books.alpha?.manualCoStudy).toEqual(['beta']);
    expect(project.library.books.beta?.manualCoStudy).toEqual(['alpha']);
  });

  it('drops a selected document id when the referenced document is absent', () => {
    const project = normalizeProject({
      version: 1,
      library: {
        books: {
          alpha: {
            title: 'Alpha',
            selectedDocumentId: 'missing-document',
            documents: [
              {
                id: 'doc-1',
                fileName: 'Alpha.txt',
                storagePath: 'output/data/documents/Alpha.txt',
                contentKind: 'text',
              },
            ],
          },
        },
      },
      manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
      constraints: {},
    });

    expect(project.library.books.alpha?.selectedDocumentId).toBeNull();
  });

  it('canonicalizes duplicate qBittorrent document refs on import', () => {
    const project = normalizeProject({
      version: 1,
      library: {
        books: {
          alpha: {
            title: 'Alpha',
            selectedDocumentId: 'old-stalled',
            documents: [
              {
                id: 'old-stalled',
                provider: 'qbittorrent',
                fileName: 'Alpha old.pdf',
                storagePath: 'output/data/documents/Alpha old.pdf',
                torrentHash: 'old',
                contentKind: 'pdf',
                status: 'stalled',
                matchScore: 0.9,
                availability: {
                  seeders: 0,
                  progress: 0.2,
                  state: 'stalledDL',
                },
              },
              {
                id: 'better-live',
                provider: 'qbittorrent',
                fileName: 'Alpha.pdf',
                storagePath: 'output/data/documents/Alpha.pdf',
                torrentHash: 'new',
                contentKind: 'pdf',
                status: 'downloading',
                matchScore: 0.95,
                availability: {
                  seeders: 8,
                  progress: 0.6,
                  state: 'downloading',
                  etaSeconds: 900,
                  downloadSpeedBytesPerSecond: 500000,
                },
              },
            ],
          },
        },
      },
      manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
      constraints: {},
    });

    const book = project.library.books.alpha;
    expect(book?.documents?.map((document) => document.id)).toEqual([
      'better-live',
    ]);
    expect(book?.documents?.[0]?.availability.etaSeconds).toBe(900);
    expect(book?.selectedDocumentId).toBeNull();
  });

  it('rejects unsupported project exports outside PlannerProjectV1', () => {
    const fixture = JSON.parse(
      readFileSync(
        join(process.cwd(), 'tests', 'fixtures', 'difficulty_engine_12.json'),
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(() => normalizeProject(fixture)).toThrow(
      'Unsupported project file. Expected PlannerProjectV1.',
    );
  });

  it('normalizes malformed constraints and manual overrides into canonical runtime state', () => {
    const project = normalizeProject({
      version: 1,
      library: {
        books: {
          alpha: {
            title: 'Alpha',
            short: 'Alpha',
            pages: 200,
            authors: [],
            subjects: [],
            isbn: '9781234567890',
            openLibraryKey: 'https://example.com/works/OL1W',
            openLibraryEditionKey: '/works/OL1W',
            openLibraryWorkKey: 'OL2W',
          },
        },
      },
      manualOverrides: {
        schedule: {
          alpha: { ds: '4.8', days: '0' },
          ghost: { ds: 99, days: 3 },
        },
        deferred: {
          '2026-02-01': ['alpha', 'ghost', '', null],
          invalid: ['alpha'],
        },
        actuals: {
          '2026-02-01': {
            alpha: { minutes: '45.5', pages: '12.25', done: true },
            ghost: { minutes: 60 },
          },
          invalid: {
            alpha: { minutes: 20 },
          },
        },
      },
      constraints: {
        sd: 'bad-date',
        par: 'x',
        schedAlgo: 'not-real',
        feasibilityMode: 'oops',
        learnerProfileMode: 'oops',
        learnerAdaptivityStrength: 500,
        targetChallenge: -20,
        relativePacingCurve: 'oops',
        dailyBookMode: 'oops',
        emptyDayPolicy: 'oops',
        compressCurve: 'sqrt',
        diffCurveFloorPoint: 0.45,
        diffCurveCeilingPoint: 0.1,
        backfillMode: 'oops',
        prereqMode: 'oops',
        weekdaysCustom: true,
        studyWeekdays: ['1', 2, 2, 9, -1],
        minPg: 15,
        maxPg: 3,
        displayGroups: { Core: '2.5', '': 7 },
      },
      enrichmentCache: {},
      uiPreferences: {
        ganttView: 'oops',
        ganttZoom: 999,
        planColorMode: 'oops',
      },
    });

    expect(project.manualOverrides.schedule).toEqual({
      alpha: { ds: 5, days: 1 },
    });
    expect(project.manualOverrides.deferred).toEqual({
      '2026-02-01': ['alpha'],
    });
    expect(project.manualOverrides.actuals).toEqual({
      '2026-02-01': {
        alpha: { minutes: 45.5, pages: 12.25, done: true },
      },
    });
    expect(project.constraints.sd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(project.library.books.alpha.isbn).toBeNull();
    expect(project.library.books.alpha.openLibraryKey).toBeNull();
    expect(project.library.books.alpha.openLibraryEditionKey).toBeNull();
    expect(project.library.books.alpha.openLibraryWorkKey).toBe('/works/OL2W');
    expect(project.library.books.alpha.owned).toBe(true);
    expect(project.library.books.alpha.planOrder).toBe(0);
    expect(project.constraints.par).toBe(3);
    expect(project.constraints.schedAlgo).toBe('balanced');
    expect(project.constraints.feasibilityMode).toBe('strict_floor');
    expect(project.constraints.learnerProfileMode).toBe('balanced_adaptive');
    expect(project.constraints.learnerAdaptivityStrength).toBe(100);
    expect(project.constraints.targetChallenge).toBe(0);
    expect(project.constraints.relativePacingStrength).toBe(50);
    expect(project.constraints.relativePacingCurve).toBe('smoothstep');
    expect(project.constraints.dailyBookMode).toBe('interspersed');
    expect(project.constraints.emptyDayPolicy).toBe('fill_when_possible');
    expect(project.constraints.compressCurve).toBe('inverse_power');
    expect(project.constraints.diffCurveFloorPoint).toBe(0.45);
    expect(project.constraints.diffCurveCeilingPoint).toBe(0.55);
    expect(project.constraints.bookOrderPolicy).toBe('auto');
    expect(project.constraints.backfillMode).toBe('global');
    expect(project.constraints.prereqMode).toBe('strict');
    expect(project.constraints.studyWeekdays).toEqual([1, 2]);
    expect(project.constraints.dpw).toBe(2);
    expect(project.constraints.maxPg).toBe(15);
    expect(project.constraints.displayGroups).toEqual({ Core: 2.5 });
    expect(project.uiPreferences.ganttView).toBe('plan');
    expect(project.uiPreferences.ganttZoom).toBe(3);
    expect(project.uiPreferences.planColorMode).toBe('category_mono');
    expect(project.uiPreferences.planSections).toEqual({
      gantt: true,
      calendar: true,
    });
    expect(project.uiPreferences.libraryListWidthPx).toBe(460);
    expect(project.uiPreferences.dismissedWarningCodes).toEqual([]);
  });

  it('creates fresh project defaults instead of reusing a shared constraint object', () => {
    const first = createEmptyProject();
    const second = createEmptyProject();

    first.constraints.par = 5;
    expect(second.constraints.par).toBe(3);
  });

  it('accepts fastest finish as a canonical scheduling algorithm', () => {
    const project = normalizeProject({
      version: 1,
      library: { books: {} },
      manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
      constraints: { schedAlgo: 'fastest' },
      enrichmentCache: {},
      uiPreferences: {},
    });

    expect(project.constraints.schedAlgo).toBe('fastest');
  });

  it('rejects impossible date strings instead of only checking their shape', () => {
    const fallback = createEmptyProject().constraints.sd;
    const project = normalizeProject({
      version: 1,
      library: { books: {} },
      manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
      constraints: { sd: '2026-02-31' },
      enrichmentCache: {},
      uiPreferences: {},
    });

    expect(project.constraints.sd).toBe(fallback);
  });

  it('removes imported description-like text from chapter lists', () => {
    const project = normalizeProject({
      version: 1,
      library: {
        books: {
          alpha: {
            title: 'Alpha',
            short: 'Alpha',
            pages: 200,
            enrichment: {
              chapters: [
                'Introduction',
                'This book gives a long summary of the subject and explains why the material matters. It is not a table of contents entry.',
                'Chapter 1 Foundations',
              ],
            },
          },
        },
      },
      manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
      constraints: {},
      enrichmentCache: {},
      uiPreferences: {},
    });

    expect(project.library.books.alpha.enrichment.chapters).toEqual([
      'Introduction',
      'Chapter 1 Foundations',
    ]);
  });
});
