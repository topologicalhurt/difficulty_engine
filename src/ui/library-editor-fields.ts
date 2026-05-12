import type { BookReadingScopeView } from '../app/selectors/library';
import type {
  BookReadingScopeMode,
  BookRecord,
  PlannerStore,
} from '../core/types';
import { badge, el } from './dom';
import { inputField, selectInput, textAreaControl } from './form-controls';
import { joinCsv, parseCsv } from './format';
import { checkboxInput, numberInput, textInput } from './library-controls';

type BookUpdate = (patch: Partial<BookRecord>) => void;

export function renderBookMetadataFields(
  book: BookRecord,
  update: BookUpdate,
): HTMLElement {
  return el(
    'div',
    { className: 'form-grid' },
    inputField(
      'Title',
      textInput(
        book.title,
        (title) => update({ title }),
        '',
        `book:${book.id}:title`,
      ),
      'Full book title.',
    ),
    inputField(
      'Short label',
      textInput(
        book.short,
        (short) => update({ short }),
        '',
        `book:${book.id}:short`,
      ),
      'Compact label used in the planner.',
    ),
    inputField(
      'Authors',
      textInput(
        joinCsv(book.authors),
        (value) => update({ authors: parseCsv(value) }),
        '',
        `book:${book.id}:authors`,
      ),
      'Comma-separated authors.',
    ),
    inputField(
      'Display group',
      textInput(
        book.displayGroup,
        (displayGroup) => update({ displayGroup }),
        '',
        `book:${book.id}:displayGroup`,
      ),
      'Purely visual grouping; does not affect inference.',
    ),
    inputField(
      'Pages',
      numberInput(
        book.pages,
        (pages) => update({ pages }),
        1,
        4000,
        1,
        `book:${book.id}:pages`,
      ),
      'Total page count.',
    ),
    inputField(
      'Seed difficulty',
      numberInput(
        book.manualSeedDifficulty,
        (manualSeedDifficulty) => update({ manualSeedDifficulty }),
        1,
        10,
        0.1,
        `book:${book.id}:manualSeedDifficulty`,
      ),
      'Manual intrinsic difficulty seed.',
    ),
    inputField(
      'Subjects',
      textInput(
        joinCsv(book.subjects),
        (value) => update({ subjects: parseCsv(value) }),
        '',
        `book:${book.id}:subjects`,
      ),
      'Comma-separated subject phrases.',
    ),
    inputField(
      'Publisher',
      textInput(
        book.publisher,
        (publisher) => update({ publisher }),
        '',
        `book:${book.id}:publisher`,
      ),
      'Optional metadata.',
    ),
    inputField(
      'ISBN',
      textInput(
        book.isbn ?? '',
        (isbn) => update({ isbn: isbn || null }),
        '',
        `book:${book.id}:isbn`,
      ),
      'Optional metadata.',
    ),
    inputField(
      'Year',
      numberInput(
        book.year ?? 2024,
        (year) => update({ year }),
        0,
        9999,
        1,
        `book:${book.id}:year`,
      ),
      'Optional publication year.',
    ),
    inputField(
      'Source PDF / URL',
      textInput(
        book.sourcePath ?? '',
        (sourcePath) => update({ sourcePath: sourcePath || null }),
        '',
        `book:${book.id}:sourcePath`,
      ),
      'Optional fetchable document source for future offline-first TOC extraction.',
    ),
  );
}

export function renderBookFlagFields(
  book: BookRecord,
  update: BookUpdate,
): HTMLElement {
  return el(
    'div',
    { className: 'flag-grid' },
    inputField(
      'Allow prerequisite overlap',
      checkboxInput(book.allowPrereqOverlap, (allowPrereqOverlap) =>
        update({ allowPrereqOverlap }),
      ),
      'Manual override that allows overlap.',
    ),
    inputField(
      'Lock difficulty',
      checkboxInput(book.lockDiff, (lockDiff) => update({ lockDiff })),
      'Freeze solver-adjusted difficulty.',
    ),
    inputField(
      'No propagation out',
      checkboxInput(book.noPropOut, (noPropOut) => update({ noPropOut })),
      'Prevent this book from influencing later books.',
    ),
    inputField(
      'Owned now',
      checkboxInput(book.owned !== false, (owned) => update({ owned })),
      'Books you have available are prioritized before books you do not own when list ordering is preferred or enforced.',
    ),
    inputField(
      'Ignored',
      checkboxInput(book.ignored, (ignored) => update({ ignored })),
      'Exclude this book from planning.',
    ),
    inputField(
      'Completed',
      checkboxInput(book.completed, (completed) => update({ completed })),
      'Treat this book as done.',
    ),
    inputField(
      'Constant background',
      checkboxInput(book.constantRD, (constantRD) => update({ constantRD })),
      'Mark as constant research/defer background.',
    ),
  );
}

export function renderBookEvidenceFields(
  book: BookRecord,
  update: BookUpdate,
): HTMLElement {
  return el(
    'div',
    { className: 'form-grid' },
    inputField(
      'Chapter titles',
      textAreaControl({
        value: book.enrichment.chapters.join('\n'),
        focusKey: `book:${book.id}:chapters`,
        rows: 8,
        onInput: (value) =>
          update({
            enrichment: {
              ...book.enrichment,
              chapters: value
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            },
          }),
      }),
      'One chapter title per line.',
    ),
    inputField(
      'Description',
      textAreaControl({
        value: book.enrichment.description,
        focusKey: `book:${book.id}:description`,
        rows: 8,
        onInput: (description) =>
          update({
            enrichment: {
              ...book.enrichment,
              description,
            },
          }),
      }),
      'Used by the inference engine as generic corpus evidence.',
    ),
  );
}

export function renderBookReadingScopeFields(
  book: BookRecord,
  readingScope: BookReadingScopeView | null,
  store: PlannerStore,
): HTMLElement {
  const analysis = readingScope;
  const sections = readingScope?.sections ?? [];
  return el(
    'div',
    { className: 'stack-layout compact-stack' },
    inputField(
      'Reading scope',
      selectInput(
        book.readingScope?.mode ?? 'project',
        [
          { value: 'project', label: 'Use project default' },
          { value: 'skip_non_core', label: 'Skip learned non-core sections' },
          { value: 'include_all', label: 'Include every learned section' },
        ],
        {
          focusKey: `book:${book.id}:readingScope`,
          onChange: (event) => {
            if (event.target instanceof HTMLSelectElement) {
              store.commands.updateBookReadingScope(book.id, {
                mode: event.target.value as BookReadingScopeMode,
              });
            }
          },
        },
      ),
      'Controls whether TOC/front matter/appendix/reference sections reduce this book’s effective reading workload.',
    ),
    el(
      'div',
      { className: 'badge-row' },
      analysis
        ? badge(`${analysis.effectivePages}/${analysis.physicalPages} effective pages`)
        : badge(`${book.pages}/${book.pages} effective pages`),
      analysis?.skippedPages ? badge(`${analysis.skippedPages} skipped`, 'warn') : null,
      analysis?.bindingReason ? badge('scope diagnostic', 'neutral') : null,
    ),
    analysis?.bindingReason
      ? el('div', { className: 'muted-copy', text: analysis.bindingReason })
      : null,
    sections.length
      ? el(
          'div',
          { className: 'stack-list compact-stack' },
          ...sections.slice(0, 8).map((section) =>
            el(
              'div',
              { className: 'stack-row' },
              badge(section.skipped ? 'skipped' : 'kept', section.skipped ? 'warn' : 'success'),
              el('span', { text: section.title }),
              el('span', { className: 'muted-copy', text: section.kind }),
            ),
          ),
        )
      : el('div', {
          className: 'muted-copy',
          text: 'No learned chapter/section titles yet.',
        }),
  );
}
