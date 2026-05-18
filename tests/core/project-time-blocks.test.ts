import { describe, expect, it } from 'vitest';

import {
  normalizeProject,
  parseProject,
  serializeProject,
} from '../../src/core/project-file';

describe('hourly calendar time blocks', () => {
  it('normalizes missing overrides to an empty map', () => {
    const project = normalizeProject({
      version: 1,
      library: { books: {} },
      manualOverrides: { schedule: {}, deferred: {}, actuals: {} },
      constraints: {},
      enrichmentCache: {},
      uiPreferences: {},
    });

    expect(project.manualOverrides.timeBlocks).toEqual({});
    expect(
      parseProject(serializeProject(project)).manualOverrides.timeBlocks,
    ).toEqual({});
  });

  it('normalizes hourly calendar time block overrides', () => {
    const project = normalizeProject({
      version: 1,
      library: {
        books: {
          book: { title: 'Book', pages: 120 },
        },
      },
      manualOverrides: {
        schedule: {},
        deferred: {},
        actuals: {},
        timeBlocks: {
          '2026-01-06': {
            book: { startMinute: 9 * 60 + 31, durationMinutes: 2000 },
            stale: { startMinute: 8 * 60, durationMinutes: 60 },
          },
          'not-a-date': {
            book: { startMinute: 8 * 60, durationMinutes: 60 },
          },
        },
      },
      constraints: {},
      enrichmentCache: {},
      uiPreferences: {},
    });

    expect(project.manualOverrides.timeBlocks).toEqual({
      '2026-01-06': {
        book: { startMinute: 10 * 60, durationMinutes: 12 * 60 },
      },
    });
  });
});
