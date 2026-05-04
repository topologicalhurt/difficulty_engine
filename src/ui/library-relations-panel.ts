import type { BookRecord } from '../core/types';
import { badge, card, el, inputField } from './dom';

export function renderRelationChips(title: string, values: string[]): HTMLElement {
  return card(
    title,
    el(
      'div',
      { className: 'badge-row' },
      ...(values.length
        ? values.map((value) => badge(value))
        : [el('div', { className: 'muted-copy', text: 'None' })]),
    ),
  );
}

export function renderBookRelationSelector(
  title: string,
  detail: string,
  currentBook: BookRecord,
  books: BookRecord[],
  selectedIds: string[],
  graphIds: string[],
  manualIds: string[],
  onChange: (ids: string[]) => void,
): HTMLElement {
  const selected = new Set(selectedIds);
  const graphSelected = new Set(graphIds);
  const manualSelected = new Set(manualIds);
  const candidates = books
    .filter((candidate) => candidate.id !== currentBook.id)
    .sort((left, right) => (left.short || left.title).localeCompare(right.short || right.title));
  if (!candidates.length) {
    return inputField(
      title,
      el('div', { className: 'muted-copy', text: 'Add another book before linking relationships.' }),
      detail,
    );
  }
  return inputField(
    title,
    el(
      'div',
      { className: 'relation-selector' },
      ...candidates.map((candidate) =>
        el(
          'label',
          { className: `relation-option${selected.has(candidate.id) ? ' selected' : ''}` },
          el('input', {
            type: 'checkbox',
            checked: selected.has(candidate.id),
            onChange: (event) => {
              const next = new Set(selectedIds);
              if ((event.target as HTMLInputElement).checked) {
                next.add(candidate.id);
              } else {
                next.delete(candidate.id);
              }
              onChange([...next].sort());
            },
          }),
          el(
            'span',
            {},
            el('strong', { text: candidate.short || candidate.title }),
            el('span', { className: 'muted-copy', text: ` ${candidate.title}` }),
            manualSelected.has(candidate.id) ? badge('manual', 'success') : null,
            !manualSelected.has(candidate.id) && graphSelected.has(candidate.id)
              ? badge('graph', 'neutral')
              : null,
          ),
        ),
      ),
    ),
    detail,
  );
}
